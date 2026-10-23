import logging
from typing import Any, Dict, Optional, Union
"""Import more if needed"""
import time
 
supportAppiumOptions: bool = True
try:
    from appium.webdriver.webdriver import AppiumOptions
except ImportError:
    supportAppiumOptions = False
 
 
from appium import webdriver
 
# For W3C actions
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions import interaction
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput
 
appium_url: str = "http://127.0.0.1"
options: Optional[Union[Dict[str, Any], AppiumOptions]] = None
logger = logging.getLogger(__name__)


# Please do not change the name of the class
class TestRunner:
    def __init__(self, device_serial_number: str, port: int):
        self.__driver: Optional[webdriver.webdriver.WebDriver] = None
        _capabilities: Dict[str, Any] = {
            "platformName": "Kepler",
            "appium:automationName": "automation-toolkit/JSON-RPC",
            "kepler:device": f"vda://{device_serial_number}",
            "kepler:jsonRPCPort": 8383,
            "newCommandTimeout": 500,
            "appium:deviceName": device_serial_number,
        }
        self.appium_url = f"{appium_url}:{port}"

        if supportAppiumOptions:
            self.__driver = webdriver.Remote(
                self.appium_url, 
                options=AppiumOptions().load_capabilities(_capabilities)
            )
        else:
            self.__driver = webdriver.Remote(self.appium_url, _capabilities)
 
 
    def _key(self, code: int, n: int = 1, gap: float = 0.7) -> None:
        for _ in range(n):
            self.__driver.execute_script("jsonrpc: injectInputKeyEvent", [{"inputKeyEvent": str(code), "holdDuration": 60}])
            time.sleep(gap)

    def prep(self) -> None:
        # wait for the live title screen to load in the WebView
        time.sleep(10)

    def run(self) -> None:
        # D-pad focus moves across the title screen buttons (Host a game / How to play / Settings),
        # each move animates the focus ring and button scale. Linux key codes: RIGHT=106, LEFT=105.
        for _ in range(4):
            self._key(106, 2)
            self._key(105, 2)
