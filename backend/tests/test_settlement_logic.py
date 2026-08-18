from app.services.bet_service import SettlementService, evaluate_pick_result


def test_evaluate_home_win():
    assert evaluate_pick_result("Home", "home", "Arsenal", "Chelsea", 2, 1) is True
    assert evaluate_pick_result("Home", "home", "Arsenal", "Chelsea", 1, 1) is False


def test_evaluate_over_under():
    assert evaluate_pick_result("Over 2.5", "over", "A", "B", 2, 1) is True
    assert evaluate_pick_result("Under 2.5", "under", "A", "B", 1, 0) is True


def test_derive_status_flex_cut():
    class FakeBet:
        selections = [1, 2, 3]
        flex_cut = 1

    legs = [
        {"legIndex": 0, "won": True},
        {"legIndex": 1, "won": False},
        {"legIndex": 2, "won": True},
    ]
    assert SettlementService.derive_status(FakeBet(), legs) == "won"

    legs[1]["won"] = False
    legs.append({"legIndex": 1, "won": False})
    legs = [
        {"legIndex": 0, "won": True},
        {"legIndex": 1, "won": False},
        {"legIndex": 2, "won": False},
    ]
    assert SettlementService.derive_status(FakeBet(), legs) == "lost"
