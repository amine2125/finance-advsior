import pytest

from ulysse.config import DATAPACK_DIR


def pytest_collection_modifyitems(config, items):
    if not (DATAPACK_DIR / "meta.json").exists():
        skip = pytest.mark.skip(reason="datapack not built (run `make data`)")
        for item in items:
            if "datapack" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def dp():
    from ulysse.data.datapack import Datapack
    return Datapack()
