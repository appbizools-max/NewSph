import React from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const FirebaseRecaptchaModal = ({ visible, onVerify, onCancel, firebaseConfig }) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #recaptcha-container {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        #loading {
          position: absolute;
          font-size: 16px;
          color: #64748b;
        }
      </style>
      <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
    </head>
    <body>
      <div id="loading">Loading security check...</div>
      <div id="recaptcha-container"></div>
      <script>
        try {
          const firebaseConfig = ${JSON.stringify(firebaseConfig)};
          firebase.initializeApp(firebaseConfig);
          
          window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            size: 'normal',
            callback: (token) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', token: token }));
            },
            'expired-callback': () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'expired' }));
            },
            'error-callback': (error) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: error.message || error }));
            }
          });

          window.recaptchaVerifier.render().then(() => {
            document.getElementById('loading').style.display = 'none';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          }).catch((err) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: err.message || err }));
          });
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: e.message || e }));
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'success') {
        onVerify(data.token);
      } else if (data.type === 'error') {
        console.warn('reCAPTCHA Error:', data.error);
        alert('Verification error: ' + data.error);
        onCancel();
      } else if (data.type === 'expired') {
        alert('Verification expired. Please try again.');
        onCancel();
      }
    } catch (err) {
      console.warn('WebView Message Parse Error:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Security Check</Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.webviewContainer}>
          <WebView
            originWhitelist={['*']}
            source={{
              html: htmlContent,
              baseUrl: `https://${firebaseConfig.authDomain}`
            }}
            style={styles.webview}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={false}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});

export default FirebaseRecaptchaModal;
