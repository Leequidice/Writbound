import tempfile
import unittest
from pathlib import Path
from writbound_worker import load_csv, remove_duplicate_rows, MAX_BYTES

class CsvTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
    def tearDown(self):
        self.temp.cleanup()
    def write(self, content):
        (self.root / 'input.csv').write_bytes(content)
    def test_valid_and_deterministic_cleaning(self):
        self.write(b'id,name\n001,Alice\n001,Alice\n002,NA\n')
        frame = load_csv(self.root, 'input.csv')
        cleaned = remove_duplicate_rows(frame)
        self.assertEqual(cleaned.values.tolist(), [['001','Alice'],['002','NA']])
        self.assertEqual(len(frame), 3)
        self.assertTrue(cleaned.equals(remove_duplicate_rows(cleaned)))
    def test_bad_content(self):
        for content in [b'', b'a,a\n1,2', b'a,\n1,2', b'a,b\n1', b'a\n', b'a\n\xff', b'a\n\x00', b'a,b\n"unclosed,1', b'a,b\n1,2,3']:
            with self.subTest(content=content):
                self.write(content)
                with self.assertRaises(ValueError): load_csv(self.root, 'input.csv')
    def test_oversize(self):
        self.write(b'a' * (MAX_BYTES + 1))
        with self.assertRaises(ValueError): load_csv(self.root, 'input.csv')
    def test_path_restrictions(self):
        for name in ['../input.csv', 'C:\\input.csv', '/input.csv', 'a.txt', 'sub/input.csv', '']:
            with self.subTest(name=name):
                with self.assertRaises(ValueError): load_csv(self.root, name)
    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError): load_csv(self.root, 'missing.csv')
    def test_column_and_row_limits(self):
        self.write((','.join(str(i) for i in range(101)) + '\n' + ','.join('x' for _ in range(101))).encode())
        with self.assertRaises(ValueError): load_csv(self.root, 'input.csv')
        self.write(b'a\n' + b'x\n' * 100001)
        with self.assertRaises(ValueError): load_csv(self.root, 'input.csv')

if __name__ == '__main__': unittest.main()
