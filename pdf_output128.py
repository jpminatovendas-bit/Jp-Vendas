"""Imagens de apresentação compactas e páginas A4, sem alterar o acervo."""
import io, math
import fitz
from PIL import Image, ImageOps, ImageCms

A4 = fitz.Rect(0, 0, 595.275590551, 841.88976378)
PHOTO_DPI = 220
CREST_DPI = 300

def image_stream(path, box, photographic=False):
    """Reduz apenas a cópia incorporada, sem ampliar fotos pequenas."""
    dpi = PHOTO_DPI if photographic else CREST_DPI
    limit = (max(1, math.ceil(box.width*dpi/72)), max(1, math.ceil(box.height*dpi/72)))
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)
        # Conversão explícita para manter a aparência de fotos com perfil ICC.
        if image.info.get('icc_profile') and 'A' not in image.getbands() and 'transparency' not in image.info:
            try:
                image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(image.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGB')
            except (OSError, ValueError, ImageCms.PyCMSError):
                image = image.convert('RGB')
        image.thumbnail(limit, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        if photographic:
            rgba = image.convert('RGBA')
            rgb = Image.new('RGB', rgba.size, 'white')
            rgb.paste(rgba, mask=rgba.getchannel('A'))
            rgb.save(output, format='JPEG', quality=85, subsampling=0, optimize=True)
        else:
            # Brasões conservam transparência e linhas, sem artefatos JPEG.
            image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB').save(output, format='PNG', optimize=True)
        return output.getvalue()

def fit_matrix(page):
    source = page.rect
    scale = min(A4.width/source.width, A4.height/source.height)
    return fitz.Matrix(scale, 0, 0, scale, (A4.width-source.width*scale)/2-source.x0*scale, (A4.height-source.height*scale)/2-source.y0*scale)

def normalize_a4(source):
    """Enquadra conteúdo vetorial inteiro em A4; mantém links e marcadores."""
    result = fitz.open()
    matrices = [fit_matrix(page) for page in source]
    try:
        for page in source:
            target = result.new_page(width=A4.width, height=A4.height)
            # Páginas vazias não são aceitas por show_pdf_page.
            if page.get_contents():
                rotation = page.rotation
                try:
                    page.set_rotation(0)
                    target.show_pdf_page(A4, source, page.number, keep_proportion=True, rotate=-rotation)
                finally:
                    page.set_rotation(rotation)
        for index, page in enumerate(source):
            for link in page.get_links():
                clean = {k:v for k,v in link.items() if k not in ('xref', 'id')}
                clean['from'] = fitz.Rect(link['from'])*matrices[index]
                if link['kind'] == fitz.LINK_GOTO and link.get('page', -1) >= 0:
                    destination = link['page']
                    if destination >= len(source):continue
                    point = link.get('to', fitz.Point(0, 0))
                    if isinstance(point, fitz.Point):clean['to'] = point*matrices[destination]
                result[index].insert_link(clean)
        toc = source.get_toc()
        if toc:result.set_toc(toc)
        if source.metadata:result.set_metadata(source.metadata)
        return result
    except Exception:
        result.close()
        raise
