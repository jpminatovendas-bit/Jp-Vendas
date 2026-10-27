import sys,tempfile,unittest,json,subprocess
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store
class Picker(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.store=Store(self.root/'dados')
    def tearDown(self):self.temp.cleanup()
    def test_cancel_untouched(self):
        with patch('app.subprocess.run',return_value=subprocess.CompletedProcess([],0,json.dumps({'path':'','cancelled':True}),'')):
            self.assertEqual(self.store.pick_folder('missing'),{'path':'','cancelled':True})
        self.assertEqual(self.store.items(),[])
    def test_selected_directory(self):
        folder=self.root/'São João';folder.mkdir()
        with patch('app.subprocess.run',return_value=subprocess.CompletedProcess([],0,json.dumps({'path':str(folder),'cancelled':False}),'')) as call:
            self.assertEqual(self.store.pick_folder(str(folder))['path'],str(folder))
            self.assertEqual(call.call_args.args[0][-1],str(folder))
    def test_picker_unavailable(self):
        with patch('app.subprocess.run',return_value=subprocess.CompletedProcess([],1,'','Tk error')):
            with self.assertRaisesRegex(ValueError,'Cole o caminho'):self.store.pick_folder()
    def test_invalid_folder(self):
        with patch('app.subprocess.run',return_value=subprocess.CompletedProcess([],0,json.dumps({'path':str(self.root/'missing'),'cancelled':False}),'')):
            with self.assertRaisesRegex(ValueError,'não encontrada'):self.store.pick_folder()
if __name__=='__main__':unittest.main()
