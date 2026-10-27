import copy
import sys
import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store
import communication as c
from test_flow import workbook

class Communication(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name)/'dados'
        self.store=Store(self.folder);self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
    def tearDown(self):
        self.store.contact_engine.close();self.tmp.cleanup()
    def test_templates_preserve_distinct_roles_and_survive_restart(self):
        templates=copy.deepcopy(c.DEFAULTS)
        for key in templates:templates[key]['body']=key+' {primeiro_nome} {municipio}'
        c.save_templates(self.store,{'templates':templates})
        self.assertEqual(c.templates(self.store),templates)
        reopened=Store(self.folder)
        try:self.assertEqual(c.templates(reopened),templates)
        finally:reopened.contact_engine.close()
    def test_invalid_template_does_not_erase_previous(self):
        before=c.templates(self.store)
        for change in ({'body':'{senha}'},{'subject':'Assunto\nBcc:outra@exemplo.com'},{'body':'x'*10001}):
            templates=copy.deepcopy(before);templates['email_presidente'].update(change)
            with self.assertRaises(ValueError):c.save_templates(self.store,{'templates':templates})
            self.assertEqual(c.templates(self.store),before)
    def test_opening_persists_normalizes_and_does_not_claim_send(self):
        before=self.store.item(self.key)
        for value in ('(48) 99999-1234','https://wa.me/5548999991234'):
            c.opened(self.store,self.key,{'channel':'whatsapp','target':'camara','recipient':value})
        c.opened(self.store,self.key,{'channel':'whatsapp','target':'presidente','recipient':'5548999991234'})
        c.opened(self.store,self.key,{'channel':'email','target':'camara','recipient':' CAMARA@EXEMPLO.COM '})
        self.assertEqual(len(c.opened(self.store,self.key)['items']),3)
        self.assertEqual(self.store.interaction_history(self.key),[])
        self.assertEqual(self.store.item(self.key)['contacted'],before['contacted'])
        reopened=Store(self.folder)
        try:self.assertEqual(len(c.opened(reopened,self.key)['items']),3)
        finally:reopened.contact_engine.close()
    def test_invalid_opening_never_writes(self):
        for body in ({'channel':'email','target':'camara','recipient':'ruim'},
                     {'channel':'whatsapp','target':'camara','recipient':'123'},
                     {'channel':'whatsapp','target':'camara','recipient':'https://example.org/5548999991234'},
                     {'channel':'email','target':'errado','recipient':'a@b.com'}):
            with self.assertRaises(ValueError):c.opened(self.store,self.key,body)
        self.assertFalse(c.opened(self.store,self.key)['items'])
    def test_parallel_openings_keep_both_roles_without_duplicate_rows(self):
        def save(i):return c.opened(self.store,self.key,{'channel':'email','target':'camara' if i%2 else 'presidente','recipient':'a@b.com'})
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(save,range(12)))
        self.assertEqual(len(c.opened(self.store,self.key)['items']),2)

    def test_direct_contact_pages_capture_only_in_authorized_tab(self):
        import capture_routes
        for index,url in enumerate(('https://camara.example.org/', 'https://camara.example.org/mesa', 'https://perfil.example.org/presidente')):
            connected=self.store.connect_capture(self.store.start_capture(self.key,url)['ticket'],index+10)
            token=connected['token']
            binding=capture_routes.check(self.store,token,{'url':url,'tab_id':index+10},'contacts')
            self.assertEqual(binding['key'],self.key)
            self.store.save_capture(token,{'url':url,'tab_id':index+10,'kind':'name','value':'Márcia Teste','direct':True})
            with self.assertRaises(ValueError):
                self.store.save_capture(token,{'url':url,'tab_id':999,'kind':'name','value':'Pessoa Errada','direct':True})
            with self.assertRaises(ValueError):
                capture_routes.advance(self.store,token,{'from_url':url,'url':'https://outra-camara.example.org/','tab_id':index+10,'transition':'link'})
        self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Márcia Teste')

if __name__=='__main__':unittest.main()
