import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useRef, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {SERVER_URL, TV_PATH} from './config';

// The game's stage runs from the game server so every TV in the room stays in sync.
// If the server can't be reached, we show the bundled "Can't reach the game" page,
// which retries on OK.
const OFFLINE_PAGE = 'file:///pkg/assets/index.html';

export const App = () => {
  const webRef = useRef(null);
  const [uri, setUri] = useState(SERVER_URL + TV_PATH);
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();

  const goOffline = () => {
    if (uri !== OFFLINE_PAGE) {
      setUri(OFFLINE_PAGE + '?server=' + encodeURIComponent(SERVER_URL + TV_PATH));
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        source={{uri}}
        onLoad={(_event: WebViewNavigationEvent) => {
          hideSplashScreenCallback();
        }}
        onError={({nativeEvent: {code, url, description}}: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
          goOffline();
        }}
        onHttpError={({nativeEvent: {url, statusCode, isMainFrame}}: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${statusCode}: ${url})`);
          if (isMainFrame) {
            goOffline();
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#140f1c'},
  webview: {backgroundColor: '#140f1c'},
});
