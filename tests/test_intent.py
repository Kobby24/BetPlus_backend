import pytest

pytestmark = pytest.mark.skip(
    reason=(
        "Twi cash-out intent interpretation is not mounted on the production "
        "router and is out of scope for the Moolre wallet payout flow."
    )
)


@pytest.mark.asyncio
async def test_unclear_intent_requires_clarification(client):
    response = await client.post(
        "/api/v1/intent/interpret",
        json={"input_type": "text", "text": "Hello", "language": "tw"},
    )
    assert response.status_code == 200
    assert response.json()["requires_clarification"] is True
