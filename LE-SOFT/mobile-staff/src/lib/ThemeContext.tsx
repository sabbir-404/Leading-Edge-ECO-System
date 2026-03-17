import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, Theme } from './themes';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

const THEME_KEY = 'lesoft_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false); // light default

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === 'dark') setIsDark(true);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
