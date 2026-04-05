type ThreadWithUnreadLabels = {
  emails: Array<{
    sysLabels: string[];
  }>;
};

export function threadHasUnreadMessages(
  thread: ThreadWithUnreadLabels | null | undefined,
) {
  return (
    thread?.emails.some((email) => email.sysLabels.includes("unread")) ?? false
  );
}

function setUnreadLabel(sysLabels: string[], unread: boolean) {
  if (unread) {
    return sysLabels.includes("unread") ? sysLabels : [...sysLabels, "unread"];
  }

  return sysLabels.filter((label) => label !== "unread");
}

export function setThreadUnreadState<
  T extends ThreadWithUnreadLabels | null | undefined,
>(thread: T, unread: boolean): T {
  if (!thread) {
    return thread;
  }

  return {
    ...thread,
    emails: thread.emails.map((email) => ({
      ...email,
      sysLabels: setUnreadLabel(email.sysLabels, unread),
    })),
  } as T;
}
