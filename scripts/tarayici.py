import json
import os
import shutil
import subprocess
import tempfile
from urllib.parse import quote

# Cloudflare R2 Public Development URL veya ileride kullanacagin custom domain.
base_url = "https://pub-9166db2e46694c818420c32e7545d40c.r2.dev"

# R2'deki ana yil klasorleri ile ayni isimde olmalilar.
ana_klasorler = ["22-23", "23-24", "24-25", "25-26"]

# Office dosyalari icin uretilen PDF onizlemeler burada tutulur.
preview_kok_klasor = "_previews"

atlanacak_dosyalar = {
    "desktop.ini",
    "thumbs.db",
    ".ds_store",
}

# LibreOffice ile PDF'e cevrilecek Office dosyalari.
# Site bu PDF'leri bulursa PPT/DOC yerine PDF onizleme acar.
preview_uretilecek_uzantilar = {".doc", ".docx", ".ppt", ".pptx"}


def libreoffice_yolunu_bul():
    aday = shutil.which("soffice")
    if aday:
        return aday

    olasi_yollar = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]

    for yol in olasi_yollar:
        if os.path.exists(yol):
            return yol

    return None


soffice_yolu = libreoffice_yolunu_bul()


def okunabilir_boyut(byte_sayisi):
    birimler = ["B", "KB", "MB", "GB"]
    boyut = float(byte_sayisi)

    for birim in birimler:
        if boyut < 1024 or birim == birimler[-1]:
            if birim == "B":
                return f"{int(boyut)} {birim}"
            return f"{boyut:.1f} {birim}"

        boyut /= 1024


def preview_pdf_yolu(orijinal_yol):
    govde, _uzanti = os.path.splitext(orijinal_yol)
    return os.path.join(preview_kok_klasor, f"{govde}.preview.pdf").replace("\\", "/")


def preview_pdf_uret(tam_yol, hedef_preview_yol):
    if not soffice_yolu:
        return False

    # Onizleme PDF'i dosyadan daha yeniyse yeniden uretmeye gerek yok.
    if os.path.exists(hedef_preview_yol) and os.path.getmtime(hedef_preview_yol) >= os.path.getmtime(tam_yol):
        return True

    os.makedirs(os.path.dirname(hedef_preview_yol), exist_ok=True)

    with tempfile.TemporaryDirectory() as gecici_klasor:
        try:
            subprocess.run(
                [
                    soffice_yolu,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    gecici_klasor,
                    tam_yol,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=120,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return False

        olusan_pdf = os.path.join(
            gecici_klasor,
            f"{os.path.splitext(os.path.basename(tam_yol))[0]}.pdf",
        )

        if not os.path.exists(olusan_pdf):
            return False

        shutil.move(olusan_pdf, hedef_preview_yol)
        return True


tum_dosyalar = []
preview_aday_sayisi = 0
preview_uretilen_sayisi = 0
preview_basarisiz = []

for yil in ana_klasorler:
    if os.path.exists(yil):
        for root, dirs, files in os.walk(yil):
            dirs[:] = sorted(
                d
                for d in dirs
                if not d.startswith(".") and d != preview_kok_klasor
            )

            for file in sorted(files):
                dosya_adi_kucuk = file.lower()

                if dosya_adi_kucuk in atlanacak_dosyalar or file.startswith("~$"):
                    continue

                tam_yol = os.path.join(root, file)

                if not os.path.isfile(tam_yol):
                    continue

                yol = tam_yol.replace("\\", "/")
                encoded_yol = quote(yol, safe="/")
                dosya_boyutu_byte = os.path.getsize(tam_yol)
                dosya_boyutu = okunabilir_boyut(dosya_boyutu_byte)
                uzanti = os.path.splitext(file)[1].lower()

                kayit = {
                    "yil": yil,
                    "dosya_adi": file,
                    "yerel_yol": yol,
                    "url": f"{base_url}/{encoded_yol}",
                    "boyut_byte": dosya_boyutu_byte,
                    "boyut": dosya_boyutu,
                }

                if uzanti in preview_uretilecek_uzantilar:
                    preview_aday_sayisi += 1
                    hedef_preview_yol = preview_pdf_yolu(yol)

                    if preview_pdf_uret(tam_yol, hedef_preview_yol):
                        encoded_preview_yol = quote(hedef_preview_yol, safe="/")
                        kayit["preview_yol"] = hedef_preview_yol
                        kayit["preview_url"] = f"{base_url}/{encoded_preview_yol}"
                        preview_uretilen_sayisi += 1
                    else:
                        preview_basarisiz.append(yol)

                tum_dosyalar.append(kayit)

with open("arsiv.json", "w", encoding="utf-8") as f:
    json.dump(tum_dosyalar, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Islem tamam. {len(tum_dosyalar)} dosya ile yeni arsiv.json hazir.")

if soffice_yolu:
    print(f"LibreOffice bulundu: {soffice_yolu}")
    print(f"PDF onizleme adayi: {preview_aday_sayisi}")
    print(f"PDF onizleme hazir/uretildi: {preview_uretilen_sayisi}")
else:
    print("LibreOffice/soffice bulunamadi. DOC/PPT PDF onizlemeleri uretilmedi.")
    print("LibreOffice kurarsan script otomatik olarak _previews klasorune PDF onizlemeleri uretir.")

if preview_basarisiz:
    print(f"PDF onizlemesi uretilemeyen dosya sayisi: {len(preview_basarisiz)}")
    for yol in preview_basarisiz[:20]:
        print(f"- {yol}")
    if len(preview_basarisiz) > 20:
        print(f"... ve {len(preview_basarisiz) - 20} dosya daha")

print("")
print("R2'ye yuklemen gerekenler:")
print("- 22-23, 23-24, 24-25, 25-26 klasorleri")
print(f"- {preview_kok_klasor} klasoru")
print("- Bu scriptin olusturdugu arsiv.json dosyasini projedeki data/arsiv.json yerine kopyala")
