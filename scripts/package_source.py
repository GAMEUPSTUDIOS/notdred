from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
output = root / 'dist' / 'source.zip'
paths = [root / n for n in ['README.md','test.cjs','package.json','package-lock.json','.gitignore']]
for name in ['dist','scripts','server','native','tests','docs','.devcontainer']:
    paths.extend(p for p in (root/name).rglob('*') if p.is_file() and p != output)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for p in sorted(set(paths)):
        archive.write(p, Path('notdred-io') / p.relative_to(root))
print(output)
