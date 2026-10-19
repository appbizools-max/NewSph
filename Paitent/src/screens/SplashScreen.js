import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, ImageBackground } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  const { user, loading } = useAuth();
  const overlayFadeAnim = useRef(new Animated.Value(0)).current;
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    if (!loading && !hasNavigated) {
      const timeout = setTimeout(() => {
        Animated.timing(overlayFadeAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }).start(() => {
          setHasNavigated(true);
          navigation.replace(user ? 'Home' : 'AuthChoice');
        });
      }, 1800);

      return () => clearTimeout(timeout);
    }
  }, [loading, hasNavigated, navigation, user]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/Noti icon.png')}
        style={styles.image}
        resizeMode="contain"
      />
      <Animated.View style={[styles.whiteOverlay, { opacity: overlayFadeAnim }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  image: {
    width: width,
    height: height,
  },
  whiteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
  },
});

export default SplashScreen;
