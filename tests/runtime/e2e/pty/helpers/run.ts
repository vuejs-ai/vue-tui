import term from "./term.ts";

const RUN_TIMEOUT_MS = 10_000;

interface RunProps {
  readonly env?: Readonly<Record<string, string>>;
  readonly columns?: number;
}

export async function run(fixture: string, props: RunProps = {}): Promise<string> {
  const session = term(fixture, [], { env: props.env, columns: props.columns });
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      session.waitForExit(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`PTY fixture ${JSON.stringify(fixture)} did not exit within 10 seconds`),
          );
        }, RUN_TIMEOUT_MS);
      }),
    ]);
    return session.output;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await session.dispose();
  }
}
