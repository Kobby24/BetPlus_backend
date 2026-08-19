from decimal import Decimal, ROUND_HALF_UP

MONEY_QUANT = Decimal("0.01")


def to_decimal(value: float | int | str | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def decimal_to_float(value: Decimal | None) -> float:
    if value is None:
        return 0.0
    return float(value)
