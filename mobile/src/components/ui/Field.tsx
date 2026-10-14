import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { font, radius, space, useTheme } from "@/theme";
import { Txt } from "./Txt";

type Props = TextInputProps & { label?: string; error?: string | null; hint?: string };

/**
 * A labelled text box: a white rounded box with a hairline that turns violet while you type in it.
 * Pass `secureTextEntry` for passwords and it gets a show/hide eye.
 */
export function Field({ label, error, hint, secureTextEntry, style, onFocus, onBlur, ...rest }: Props) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const focus = useSharedValue(0);
  const idle = error ? theme.danger : theme.border;
  const active = error ? theme.danger : theme.accent;
  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [idle, active]),
    shadowOpacity: focus.value * 0.12,
  }));

  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="caption" tone="muted">{label}</Txt> : null}
      <Animated.View
        style={[
          styles.box,
          { backgroundColor: theme.surface, shadowColor: theme.glow },
          rest.multiline && { alignItems: "flex-start" },
          ring,
        ]}
      >
        <TextInput
          {...rest}
          onFocus={(event) => {
            focus.set(withTiming(1, { duration: 180 }));
            onFocus?.(event);
          }}
          onBlur={(event) => {
            focus.set(withTiming(0, { duration: 220 }));
            onBlur?.(event);
          }}
          accessibilityLabel={label ?? rest.placeholder}
          secureTextEntry={hidden}
          placeholderTextColor={theme.subtle}
          selectionColor={theme.accent}
          style={[styles.input, { color: theme.ink, fontFamily: font.regular }, rest.multiline && { minHeight: 96, textAlignVertical: "top" }, style]}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? "Show password" : "Hide password"} accessibilityRole="button">
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={theme.subtle} />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? <Txt variant="caption" tone="danger">{error}</Txt> : hint ? <Txt variant="caption" tone="subtle">{hint}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  input: { flex: 1, fontSize: 15, paddingVertical: 13, outlineWidth: 0 },
});
