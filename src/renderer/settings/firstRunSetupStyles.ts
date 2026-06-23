import { makeStyles, tokens } from "@fluentui/react-components";

export const useFirstRunStyles = makeStyles({
  fieldset: {
    borderTopColor: tokens.colorNeutralStroke2,
    borderTopStyle: "solid",
    borderTopWidth: tokens.strokeWidthThin,
    borderRight: 0,
    borderBottom: 0,
    borderLeft: 0,
    display: "grid",
    gap: tokens.spacingVerticalM,
    margin: 0,
    padding: `${tokens.spacingVerticalL} 0 0`
  },
  legend: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    padding: 0
  },
  userRow: {
    alignItems: "end",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "1fr auto",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    "@media (max-width: 760px)": {
      gridTemplateColumns: "1fr"
    }
  }
});
