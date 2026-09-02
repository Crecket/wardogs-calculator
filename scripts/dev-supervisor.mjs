import { spawn } from 'node:child_process';

const RESTART_DELAY_MS = 400;
const MAX_RESTART_DELAY_MS = 5000;
const HEALTHY_UPTIME_MS = 4000;

const command =
    process.argv.slice(2);

if (!command.length) {
    console.error(
        '[dev] Nothing to supervise. ' +
        'Usage: node scripts/dev-supervisor.mjs <command> [args...]'
    );

    process.exit(1);
}

const label =
    command.join(' ');

let child = null;
let stopping = false;
let delay = RESTART_DELAY_MS;
let timer = null;

function start() {
    timer = null;

    const startedAt =
        Date.now();

    child = spawn(
        command[0],
        command.slice(1),
        {
            stdio: 'inherit',
            env: process.env
        }
    );

    child.on(
        'error',
        error => {
            console.error(
                `[dev] Could not launch ${label}: ${error.message}`
            );
        }
    );

    child.on(
        'exit',
        (code, signal) => {
            child = null;

            if (stopping) {
                process.exit(code === null ? 0 : code);
            }

            const uptime =
                Date.now() - startedAt;

            delay =
                uptime >= HEALTHY_UPTIME_MS
                    ? RESTART_DELAY_MS
                    : Math.min(delay * 2, MAX_RESTART_DELAY_MS);

            const reason =
                signal
                    ? `signal ${signal}`
                    : `exit code ${code}`;

            console.error(
                `[dev] ${label} stopped (${reason}). ` +
                `Restarting in ${delay} ms.`
            );

            timer = setTimeout(start, delay);
        }
    );
}

function stop(signal) {
    stopping = true;

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if (child) {
        child.kill(signal);

        return;
    }

    process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

start();
