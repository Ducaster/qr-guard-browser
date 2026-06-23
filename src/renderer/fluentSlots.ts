import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

interface TestableButtonSlotProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly "data-testid"?: string;
}

interface TestableInputSlotProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  readonly "data-testid"?: string;
}

export const buttonSlot = (props: TestableButtonSlotProps): TestableButtonSlotProps => props;

export const inputSlot = (props: TestableInputSlotProps): TestableInputSlotProps => props;
