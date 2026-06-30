import {
  FluentProvider,
  makeStaticStyles,
  makeStyles,
  tokens,
  webLightTheme,
  type Theme
} from "@fluentui/react-components";
import { useMemo, type JSX, type ReactNode } from "react";

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
  const theme = useMemo<Theme>(() => {
    return {
      ...webLightTheme,
      fontFamilyBase: KOREAN_FONT_FAMILY,
      fontFamilyNumeric: KOREAN_FONT_FAMILY
    };
  }, []);

  return (
    <FluentProvider className={styles.root} theme={theme}>
      {children}
    </FluentProvider>
  );
};
