"""Pruebas unitarias de las interfaces y sus stubs (no requieren base de datos)."""

import ast
from pathlib import Path
from uuid import uuid4

import pytest

from app.config import Settings
from app.services import get_mandado_service, get_payment_service
from app.services.mandados import MandadoStub
from app.services.notificaciones import enlace_whatsapp
from app.services.pagos import ManualPayment

APP = Path(__file__).resolve().parents[1] / "app"


def test_stub_de_mandados_responde_proximamente() -> None:
    disp = MandadoStub().get_disponibilidad(uuid4())
    assert disp.model_dump(exclude_none=True) == {"disponible": False, "razon": "proximamente"}


def test_con_flags_por_defecto_se_usan_los_stubs() -> None:
    settings = Settings(mandados_activos=False, pagos_proveedor="manual")
    assert isinstance(get_mandado_service(settings), MandadoStub)
    assert isinstance(get_payment_service(settings), ManualPayment)


def test_pago_manual_queda_pendiente_y_en_pesos_enteros() -> None:
    r = ManualPayment().charge(uuid4(), 1500)
    assert (r.proveedor, r.estado, r.monto) == ("manual", "pendiente", 1500)
    with pytest.raises(ValueError):
        ManualPayment().charge(uuid4(), -1)


def test_enlace_whatsapp_agrega_indicativo_y_codifica_texto() -> None:
    assert (
        enlace_whatsapp("300 123 4567", "Hola, te encontré en MiCuadra")
        == "https://wa.me/573001234567?text=Hola%2C%20te%20encontr%C3%A9%20en%20MiCuadra"
    )


@pytest.mark.parametrize("archivo", ["services/directorio.py", "routers/directorio.py"])
def test_directorio_no_conoce_implementaciones_de_mandados(archivo: str) -> None:
    """Principio rector: el directorio solo depende de la interfaz `MandadoService`."""
    arbol = ast.parse((APP / archivo).read_text())
    nombres = {a.name for n in ast.walk(arbol) if isinstance(n, ast.ImportFrom) for a in n.names}
    assert not {"MandadoStub", "MandadoReal"} & nombres


def test_cors_acepta_lista_separada_por_comas() -> None:
    s = Settings(cors_origins="https://micuadra.co, https://staging.micuadra.co")  # type: ignore[arg-type]
    assert s.cors_origins == ["https://micuadra.co", "https://staging.micuadra.co"]


def test_database_url_agrega_driver() -> None:
    assert Settings(database_url="postgres://u:p@h:5432/db").database_url.startswith(
        "postgresql+psycopg://"
    )
