from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_legacy_path = Path(__file__).resolve().parent.parent / "schemas.py"
_legacy_spec = spec_from_file_location("app._legacy_schemas", _legacy_path)
if _legacy_spec is None or _legacy_spec.loader is None:
    raise ImportError(f"Unable to load API schemas from {_legacy_path}")

_legacy_module = module_from_spec(_legacy_spec)
_legacy_spec.loader.exec_module(_legacy_module)

for _name in dir(_legacy_module):
    if not _name.startswith("_"):
        globals()[_name] = getattr(_legacy_module, _name)

__all__ = [_name for _name in globals() if not _name.startswith("_")]
