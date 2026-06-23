import {
  Card,
  Caption1Strong,
  Text,
  Title1,
  Title2,
  makeStyles,
  mergeClasses,
  tokens
} from "@fluentui/react-components";
import { type JSX, type ReactNode } from "react";

const useLayoutStyles = makeStyles({
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS
  },
  actionsEnd: {
    justifyContent: "flex-end"
  },
  center: {
    alignItems: "center"
  },
  formGrid: {
    display: "grid",
    gap: tokens.spacingVerticalL
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: tokens.spacingHorizontalL,
    justifyContent: "space-between"
  },
  headerText: {
    display: "grid",
    gap: tokens.spacingVerticalXXS
  },
  panel: {
    boxShadow: tokens.shadow16,
    display: "grid",
    gap: tokens.spacingVerticalXL,
    maxWidth: "1120px",
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    width: "min(100%, 1120px)"
  },
  narrow: {
    maxWidth: "440px"
  },
  pageStack: {
    display: "grid",
    gap: tokens.spacingVerticalL,
    maxWidth: "1120px",
    width: "min(100%, 1120px)"
  },
  screen: {
    alignItems: "flex-start",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    height: "100vh",
    justifyContent: "center",
    minHeight: 0,
    overflowY: "auto",
    padding: tokens.spacingVerticalXXL,
    width: "100vw"
  },
  section: {
    display: "grid",
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`
  },
  sectionTitle: {
    alignItems: "center",
    display: "flex",
    gap: tokens.spacingHorizontalM,
    justifyContent: "space-between"
  },
  splitTwo: {
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
  },
  splitThree: {
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
  },
  stack: {
    display: "grid",
    gap: tokens.spacingVerticalM
  },
  title: {
    lineHeight: tokens.lineHeightHero700
  },
  wrapGrid: {
    alignItems: "end",
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
  },
  "@media (max-width: 760px)": {
    actionsEnd: {
      justifyContent: "stretch"
    },
    header: {
      display: "grid"
    },
    panel: {
      padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`
    },
    screen: {
      padding: tokens.spacingVerticalM
    },
    splitThree: {
      gridTemplateColumns: "1fr"
    },
    splitTwo: {
      gridTemplateColumns: "1fr"
    }
  }
});

interface ScreenProps {
  readonly center?: boolean;
  readonly children: ReactNode;
}

interface PanelCardProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly narrow?: boolean;
}

interface HeaderBlockProps {
  readonly action?: ReactNode;
  readonly title: string;
}

interface SectionCardProps {
  readonly action?: ReactNode;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly title: string;
}

interface ActionsRowProps {
  readonly alignEnd?: boolean;
  readonly children: ReactNode;
}

export const Screen = ({ center = false, children }: ScreenProps): JSX.Element => {
  const styles = useLayoutStyles();

  return <main className={mergeClasses(styles.screen, center && styles.center)}>{children}</main>;
};

export const PanelCard = ({ ariaLabel, children, narrow = false }: PanelCardProps): JSX.Element => {
  const styles = useLayoutStyles();

  return (
    <Card
      appearance="filled"
      aria-label={ariaLabel}
      className={mergeClasses(styles.panel, narrow && styles.narrow)}
    >
      {children}
    </Card>
  );
};

export const HeaderBlock = ({ action, title }: HeaderBlockProps): JSX.Element => {
  const styles = useLayoutStyles();

  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <Caption1Strong>QR 가드 브라우저</Caption1Strong>
        <Title1 as="h1" className={styles.title}>
          {title}
        </Title1>
      </div>
      {action}
    </div>
  );
};

export const SectionCard = ({ action, ariaLabel, children, title }: SectionCardProps): JSX.Element => {
  const styles = useLayoutStyles();

  return (
    <Card appearance="filled" aria-label={ariaLabel} className={styles.section}>
      <div className={styles.sectionTitle}>
        <Title2 as="h2">{title}</Title2>
        {action}
      </div>
      {children}
    </Card>
  );
};

export const ActionsRow = ({ alignEnd = false, children }: ActionsRowProps): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={mergeClasses(styles.actions, alignEnd && styles.actionsEnd)}>{children}</div>;
};

export const FormGrid = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.formGrid}>{children}</div>;
};

export const Stack = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.stack}>{children}</div>;
};

export const PageStack = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.pageStack}>{children}</div>;
};

export const SplitTwo = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.splitTwo}>{children}</div>;
};

export const SplitThree = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.splitThree}>{children}</div>;
};

export const WrapGrid = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const styles = useLayoutStyles();

  return <div className={styles.wrapGrid}>{children}</div>;
};

export const MutedText = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <Text block size={200}>
    {children}
  </Text>
);
