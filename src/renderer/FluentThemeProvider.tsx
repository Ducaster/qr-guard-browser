import {
  FluentProvider,
  makeStaticStyles,
  makeStyles,
  tokens,
  webDarkTheme,
  webLightTheme,
  type Theme
} from "@fluentui/react-components";
import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)" as const;
const KOREAN_FONT_FAMILY =
  '"Segoe UI Variable", "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const useGlobalStyles = makeStaticStyles({
  "*": {
    boxSizing: "border-box"
  },
  "html, body, #root": {
    height: "100%",
    margin: 0,
    minHeight: "100%",
    width: "100%"
  },
  body: {
    backgroundColor: "transparent",
    overflow: "hidden"
  },
  "button, input, textarea, select": {
    fontFamily: "inherit"
  }
});

const useProviderStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    fontFamily: KOREAN_FONT_FAMILY,
    minHeight: "100vh",
    width: "100vw"
  }
});

interface FluentThemeProviderProps {
  readonly children: ReactNode;
}

export const FluentThemeProvider = ({ children }: FluentThemeProviderProps): JSX.Element => {
  useGlobalStyles();
  const styles = useProviderStyles();
  const isDarkMode = usePrefersDarkMode();
  const theme = useMemo<Theme>(() => {
    const baseTheme = isDarkMode ? webDarkTheme : webLightTheme;

    return {
      ...baseTheme,
      fontFamilyBase: KOREAN_FONT_FAMILY,
      fontFamilyNumeric: KOREAN_FONT_FAMILY
    };
  }, [isDarkMode]);

  return (
    <FluentProvider className={styles.root} theme={theme}>
      {children}
    </FluentProvider>
  );
};

const usePrefersDarkMode = (): boolean => {
  const [isDarkMode, setIsDarkMode] = useState(() => window.matchMedia(DARK_SCHEME_QUERY).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
    const updateTheme = (event: MediaQueryListEvent): void => {
      setIsDarkMode(event.matches);
    };

    setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  return isDarkMode;
};
