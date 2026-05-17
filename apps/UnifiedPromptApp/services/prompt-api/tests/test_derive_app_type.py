"""Lock the narrowed _derive_app_type behavior so weak web-keyword matches
don't silently regress and start mis-classifying desktop/CLI goals as 'web'.

Mirror in Resolve-AppTypeFromSpec (Orchestration/scripts/POF.ps1) should stay
in sync.
"""

from app import _derive_app_type


class TestExplicitRequestedTypeAlwaysWins:
    def test_explicit_wins_over_goal_keywords(self):
        assert _derive_app_type("build a website with React", requested_app_type="cli") == "cli"

    def test_explicit_lowercased_and_trimmed(self):
        assert _derive_app_type("anything", requested_app_type="  WPF  ") == "wpf"

    def test_empty_explicit_falls_through(self):
        assert _derive_app_type("build a website", requested_app_type="") == "web"
        assert _derive_app_type("build a website", requested_app_type="   ") == "web"


class TestStrongWebSignals:
    def test_website(self):
        assert _derive_app_type("build a website for my band") == "web"

    def test_webapp_variants(self):
        assert _derive_app_type("build a webapp") == "web"
        assert _derive_app_type("build a web app for tracking") == "web"
        assert _derive_app_type("build a web application") == "web"

    def test_browser(self):
        assert _derive_app_type("a browser game using canvas") == "web"

    def test_nextjs(self):
        assert _derive_app_type("scaffold a next.js project") == "web"
        assert _derive_app_type("scaffold a nextjs project") == "web"

    def test_vite(self):
        assert _derive_app_type("vite + typescript starter") == "web"

    def test_frontend(self):
        assert _derive_app_type("frontend for the analytics dashboard") == "web"

    def test_spa_pwa(self):
        assert _derive_app_type("ship a SPA") == "web"
        assert _derive_app_type("ship a PWA") == "web"


class TestWeakWebSignalsNoLongerForceWeb:
    """These goals used to be mis-classified as 'web' because the prior regex
    matched bare 'react', 'html', 'css', 'dom', or 'web'. They should now fall
    through to a stronger signal (desktop) or to 'unknown'."""

    def test_tkinter_app_mentioning_html_like_markup(self):
        # Was 'web' due to bare 'html' match; should be 'wpf' (tkinter wins).
        assert _derive_app_type("tkinter app that renders html-like markup") == "wpf"

    def test_react_native_mobile(self):
        # Was 'web' due to bare 'react' match. No strong web or desktop signal
        # remains, so it should fall through to 'unknown'.
        assert _derive_app_type("react native mobile app for iOS") == "unknown"

    def test_xml_dom_parser_cli(self):
        # Was 'web' due to bare 'dom' match.
        assert _derive_app_type("a CLI tool that walks an XML dom tree") == "unknown"

    def test_css_like_styling_for_terminal(self):
        # Was 'web' due to bare 'css' match.
        assert _derive_app_type("terminal app with css-like color tokens") == "unknown"

    def test_bare_web_is_no_longer_a_trigger(self):
        # 'web' alone (e.g., "no web required") used to false-positive.
        assert _derive_app_type("background daemon, no web required") == "unknown"


class TestDesktopSignals:
    def test_wpf(self):
        assert _derive_app_type("a WPF dashboard with XAML") == "wpf"

    def test_tkinter(self):
        assert _derive_app_type("build a tkinter calculator") == "wpf"

    def test_pyqt(self):
        assert _derive_app_type("simple pyqt window") == "wpf"

    def test_winforms(self):
        assert _derive_app_type("windows forms inventory tracker") == "wpf"


class TestUnknownFallback:
    def test_empty_goal(self):
        assert _derive_app_type("") == "unknown"

    def test_none_goal(self):
        assert _derive_app_type(None) == "unknown"  # type: ignore[arg-type]

    def test_goal_without_any_signal(self):
        assert _derive_app_type("optimize this algorithm for sorting") == "unknown"


class TestNegationStripping:
    def test_do_not_create_a_web_app_does_not_trigger_web(self):
        assert _derive_app_type("do not create a web app, build a CLI instead") == "unknown"

    def test_non_goals_section_is_stripped(self):
        goal = "build a tkinter calculator. Non-goals: web, browser, react"
        assert _derive_app_type(goal) == "wpf"

    def test_without_phrase_is_stripped(self):
        assert _derive_app_type("CLI tool without browser dependencies") == "unknown"
