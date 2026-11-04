import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GhostButton } from './Button';

const makeStyles = (p: Palette) => ({
  wrap: {
    gap: 8,
  },
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  label: {
    color: p.muted,
    flexShrink: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  toggle: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  input: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top' as const,
  },
  summary: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

// lineCount counts the nonblank lines entered, so a hidden value still shows
// that something is there.
function lineCount(value: string): number {
  return value.split('\n').filter((line) => line.trim().length > 0).length;
}

// SecretArea is a multi-line input for key material pasted from elsewhere. A
// multi-line TextInput cannot mask its text, so the value stays off screen
// until the user asks to see it, and the input opts out of the autocorrect,
// autofill and keyboard learning that would otherwise keep a copy of it.
export function SecretArea({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [show, setShow] = useState(false);
  const lines = lineCount(value);

  // A clipboard read can reject under platform access restrictions, so a
  // failure is treated as an empty clipboard rather than an unhandled rejection.
  const paste = async () => {
    let clip = '';
    try {
      clip = await Clipboard.getStringAsync();
    } catch {
      return;
    }
    if (clip.trim().length > 0) {
      onChange(clip);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
          <Text style={styles.toggle}>{show ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {show ? (
        <TextInput
          multiline
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          keyboardType={
            Platform.OS === 'android' ? 'visible-password' : 'default'
          }
          accessibilityLabel={label}
          style={styles.input}
        />
      ) : (
        <Text style={styles.summary}>
          {lines === 0
            ? 'Nothing entered'
            : `${lines} ${lines === 1 ? 'line' : 'lines'} entered`}
        </Text>
      )}
      <GhostButton
        icon={ClipboardPaste}
        onPress={() => void paste()}
        disabled={disabled}
      >
        Paste
      </GhostButton>
    </View>
  );
}
