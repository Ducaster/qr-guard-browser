import type { AuditLockReason } from "../core/audit-log";
import type { GuardState } from "../core/state-machine";
import type { QrWebContentsLike } from "./qr-navigation-watcher";
import type { SettingsRepository } from "../core/settings-repo";

export interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export interface QrTitleLearningInput {
  readonly qrWebContents: QrWebContentsLike;
  readonly relock: (reason: AuditLockReason) => void;
  readonly repository: SettingsRepository;
  readonly state: GuardState;
}

export const learnQrTitleFromCurrentPage = (input: QrTitleLearningInput): ActionResponse => {
  if (input.state !== "siteLogin") {
    return {
      errors: ["사이트 로그인 중에만 등록할 수 있습니다."],
      ok: false
    };
  }

  const title = input.qrWebContents.getTitle().trim();

  if (title.length === 0) {
    return {
      errors: ["현재 화면 제목을 읽을 수 없습니다."],
      ok: false
    };
  }

  input.repository.save({
    ...input.repository.load(),
    qrTitlePattern: title
  });
  input.relock("manual");

  return { ok: true };
};
