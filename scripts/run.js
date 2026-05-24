const { spawn } = require('child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run.js <command> [args...]');
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
