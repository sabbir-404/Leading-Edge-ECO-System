import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  SafeAreaView,
  StyleSheet,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../lib/ThemeContext';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Don't wrap in ScrollView — useful when content is already a FlatList */
  noScroll?: boolean;
}

/**
 * Wraps content in SafeAreaView + KeyboardAvoidingView + ScrollView.
 * When the keyboard appears, the focused input scrolls into view automatically.
 */
export default function KeyboardAwareContainer({
  children,
  style,
  contentStyle,
  refreshing,
  onRefresh,
  noScroll = false,
}: Props) {
  const { theme } = useTheme();

  const safeStyle = [{ flex: 1, backgroundColor: theme.bg }, style];

  const inner = noScroll ? (
    <>{children}</>
  ) : (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={safeStyle}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {inner}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 32,
  },
});
