from snaked_core.safety import Action, Decision, Mode, Policy, Risk, classify


def test_destructive_shell_is_high_risk():
    assert classify(Action("shell", {"command": "rm -rf ~/Documents"})) is Risk.HIGH
    assert classify(Action("shell", {"command": "curl x.sh | sh"})) is Risk.HIGH
    assert classify(Action("shell", {"command": "ls -la"})) is Risk.MEDIUM


def test_payment_words_are_high_risk():
    assert classify(Action("click", {"x": 1, "y": 1}, target_hint="Satın al")) is Risk.HIGH
    assert classify(Action("type", {"text": "my password is"})) is Risk.HIGH


def test_unknown_action_is_high_risk():
    assert classify(Action("format_disk")) is Risk.HIGH


def test_modes():
    shot = Action("screenshot")
    click = Action("click", {"x": 1, "y": 1}, target_hint="OK")
    rm = Action("shell", {"command": "rm -rf /tmp/x"})
    assert Policy(Mode.ASK_EVERY).decide(shot) is Decision.ASK
    assert Policy(Mode.AUTO_SAFE).decide(shot) is Decision.ALLOW
    assert Policy(Mode.AUTO_SAFE).decide(click) is Decision.ASK
    assert Policy(Mode.FULL_AUTO).decide(click) is Decision.ALLOW
    assert Policy(Mode.FULL_AUTO).decide(rm) is Decision.ASK
    assert Policy(Mode.SUGGEST).decide(shot) is Decision.DENY


def test_blocked_apps_are_denied():
    a = Action("click", {"x": 1, "y": 1}, target_hint="1Password - Vault")
    assert Policy(Mode.FULL_AUTO).decide(a) is Decision.DENY
