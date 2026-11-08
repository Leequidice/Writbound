"""Deterministic, allowlisted CSV tools. No model, shell or signing access."""
import csv
import io
from pathlib import Path
import pandas as pd

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 100

def read_workspace_file(root: Path, filename: str, limit: int) -> bytes:
    if not isinstance(filename, str) or not filename or '/' in filename or '\\' in filename or ':' in filename or Path(filename).name != filename or Path(filename).suffix.lower() != '.csv':
        raise ValueError('Input must be a plain .csv filename')
    base = root.resolve(strict=True)
    path = base / filename
    if path.is_symlink() or path.resolve(strict=True).parent != base or not path.is_file():
        raise ValueError('Input must be a regular file inside the input directory')
    with path.open('rb') as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise ValueError('CSV exceeds workspace byte limit')
    return data

def parse_csv(data: bytes) -> tuple[list[str], list[list[str]]]:
    """Parse exact UTF-8 string cells, including empty fields and rows."""
    if len(data) > MAX_BYTES:
        raise ValueError('CSV exceeds 5 MiB limit')
    if b'\x00' in data:
        raise ValueError('CSV contains NUL bytes')
    try:
        text = data.decode('utf-8-sig')
        rows = csv.reader(io.StringIO(text, newline=''), strict=True)
        header = next(rows)
        if not header or len(header) > MAX_COLUMNS or any(not name.strip() for name in header) or len(set(header)) != len(header):
            raise ValueError('CSV requires 1-100 unique, nonempty column names')
        records = []
        for row in rows:
            if not row:
                row = [""] * len(header)
            if len(row) != len(header) or len(records) >= MAX_ROWS:
                raise ValueError('CSV has inconsistent columns or exceeds 100000 rows')
            records.append(row)
        return header, records
    except (UnicodeError, csv.Error, StopIteration) as error:
        raise ValueError('Input must be a nonempty, well-formed UTF-8 CSV') from error

def load_csv(root: Path, filename: str) -> pd.DataFrame:
    """Load only a single CSV filename within a trusted, operator-selected root."""
    header, rows = parse_csv(read_workspace_file(root, filename, MAX_BYTES))
    if not rows:
        raise ValueError('CSV requires at least one data row')
    return pd.DataFrame(rows, columns=header, dtype=str)

def remove_duplicate_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Keep the first exact duplicate; preserve strings, ordering and input frame."""
    return frame.drop_duplicates(keep='first').reset_index(drop=True).copy()
