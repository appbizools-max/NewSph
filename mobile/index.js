console.log('[SPH_ENTRY] index.js starting...');
import { registerRootComponent } from 'expo';
import React, { useState, useEffect } from 'react';
import { Text, View, ScrollView, SafeAreaView, TouchableOpacity, StyleSheet, Platform, LogBox } from 'react-native';

// Suppress harmless background network/reconnection warnings from Metro terminal & device screen
LogBox.ignoreLogs([
  '@firebase/firestore',
  'WebChannelConnection',
  'transport errored',
  'expo-notifications',
  'Error thrown while updating the device push token',
  'Network request failed',
  'Setting a timer',
  'AsyncStorage has been extracted',
]);

const _origWarn = console.warn;
console.warn = function (...args) {
  const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || JSON.stringify(args[0]) || '');
  if (
    msg.includes('WebChannelConnection') ||
    msg.includes('transport errored') ||
    msg.includes('expo-notifications') ||
    msg.includes('device push token')
  ) {
    return; // Silently swallow benign background network warnings
  }
  _origWarn.apply(console, args);
};

// Polyfill global.Blob in React Native to support ArrayBuffer & Uint8Array without throwing
if (typeof global !== 'undefined' && global.Blob) {
  try {
    var OriginalBlob = global.Blob;
    var supportsArrayBuffer = false;
    try {
      new OriginalBlob([new Uint8Array(1)]);
      supportsArrayBuffer = true;
    } catch (_) {
      supportsArrayBuffer = false;
    }

    if (!supportsArrayBuffer) {
      function uint8ArrayToBinaryString(uint8Array) {
        var result = '';
        var chunkSize = 32768;
        for (var i = 0; i < uint8Array.length; i += chunkSize) {
          result += String.fromCharCode.apply(null, uint8Array.subarray(i, i + chunkSize));
        }
        return result;
      }

      function PatchedBlob(parts, options) {
        if (Array.isArray(parts)) {
          parts = parts.map(function (part) {
            if (part instanceof ArrayBuffer) {
              return uint8ArrayToBinaryString(new Uint8Array(part));
            }
            if (ArrayBuffer.isView(part)) {
              return uint8ArrayToBinaryString(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
            }
            return part;
          });
        }
        return new OriginalBlob(parts, options);
      }
      PatchedBlob.prototype = OriginalBlob.prototype;
      global.Blob = PatchedBlob;
    }
  } catch (e) {
    console.warn('[SPH_ENTRY] Blob polyfill notice:', e);
  }
}

// ErrorUtils handler protects against uncaught background errors

// Global error store for release mode diagnostic capture
var globalJsError = null;
var globalErrorListeners = [];
function notifyError(errStr) {
  globalJsError = errStr;
  for (var i = 0; i < globalErrorListeners.length; i++) {
    try { globalErrorListeners[i](errStr); } catch (e) { }
  }
}

// Override React Native's default release error handler to prevent automatic app shutdown
if (typeof global !== 'undefined' && global.ErrorUtils) {
  try {
    global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
      var stack = error && error.stack ? String(error.stack) : String(error && error.message ? error.message : error || 'Unknown Error');
      // Silently swallow non-critical streaming network buffer overflows from Hermes
      if (stack.includes('String length exceeds limit') || stack.includes('didReceiveIncrementalData')) {
        console.warn('[SPH_NETWORK_GUARD] Ignored background network buffer warning');
        return;
      }
      console.error('[SPH_RELEASE_FATAL_ERROR]', stack, 'isFatal:', isFatal);
      notifyError(stack);
    });
  } catch (e) {
    console.warn('Failed to set global ErrorUtils handler:', e);
  }
}

// Intercept unhandled Promise rejections
if (typeof Promise !== 'undefined') {
  try {
    var tracking = require('promise/setimmediate/rejection-tracking');
    if (tracking && typeof tracking.enable === 'function') {
      tracking.enable({
        allRejections: true,
        onUnhandled: function (id, error) {
          var stack = error && error.stack ? String(error.stack) : String(error && error.message ? error.message : error || 'Unhandled Promise Rejection');
          console.error('[SPH_UNHANDLED_PROMISE]', stack);
          notifyError('Unhandled Promise: ' + stack);
        },
      });
    }
  } catch (e) { }
}

var TargetApp = null;
var startupImportError = null;

try {
  console.log('[SPH_ENTRY] Requiring ./App...');
  var AppMod = require('./App');
  TargetApp = AppMod.default || AppMod;
  console.log('[SPH_ENTRY] ./App loaded successfully!');
} catch (err) {
  console.error('[SPH_ENTRY] CRITICAL STARTUP ERROR requiring ./App:', err);
  startupImportError = String(err && err.stack ? err.stack : err && err.message ? err.message : err || 'Import Error');
}

function GlobalAppWrapper() {
  const [activeError, setActiveError] = useState(globalJsError || startupImportError);

  useEffect(() => {
    const handler = function (err) { setActiveError(err); };
    globalErrorListeners.push(handler);
    return () => {
      globalErrorListeners = globalErrorListeners.filter(function (l) { return l !== handler; });
    };
  }, []);

  if (activeError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <View style={styles.errorHeader}>
          <Text style={styles.errorTitle}>Application Diagnostic Alert</Text>
          <Text style={styles.errorSub}>The app encountered an exception on startup:</Text>
        </View>
        <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.errorText}>{activeError}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.reloadBtn} onPress={() => setActiveError(null)}>
          <Text style={styles.reloadBtnText}>Dismiss & Attempt Load</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (TargetApp) {
    const Component = TargetApp;
    return <Component />;
  }

  return (
    <SafeAreaView style={styles.errorContainer}>
      <Text style={styles.errorTitle}>App Component Unavailable</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 20,
    justifyContent: 'center',
  },
  errorHeader: {
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f87171',
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 13,
    color: '#94a3b8',
  },
  errorBox: {
    maxHeight: 450,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  errorText: {
    fontSize: 12,
    color: '#fca5a5',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    lineHeight: 18,
  },
  reloadBtn: {
    marginTop: 16,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  reloadBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

try {
  console.log('[SPH_ENTRY] Calling registerRootComponent(GlobalAppWrapper)...');
  registerRootComponent(GlobalAppWrapper);
  console.log('[SPH_ENTRY] registerRootComponent(GlobalAppWrapper) COMPLETED SUCCESSFULLY!');
} catch (regErr) {
  console.error('[SPH_ENTRY] ERROR in registerRootComponent:', regErr);
}
