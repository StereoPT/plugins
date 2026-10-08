import type { Register } from 'claude-code';

const PANE = 'morning';
const DAILY_DIR = 'INBOX';

export const todayName = (now: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'morning',
      description: "Show today's daily note in a pane",
    });

    return next(e);
  });

  on('command.run', { command: 'morning' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Morning' });

    return { text: 'Morning pane opened.' };
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown } = $.ui.resolve(e);
    const name = todayName(new Date());
    const path = `${await $.session.root()}/${DAILY_DIR}/${name}.md`;
    const note = await $.fs.read(path).catch(() => undefined);

    return (
      <Box flexDirection="column">
        <Text bold>{name}</Text>
        {typeof note === 'string' ? (
          <Markdown text={note} />
        ) : (
          <Text dimColor>No daily note for today yet.</Text>
        )}
      </Box>
    );
  });
}
