/* Keep the configured launcher identity alive while its resource-limited
 * Python child runs. Both remain in REA's owned process group. */
#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
  char *python = getenv("REA_VERIFY_LIMITED_PYTHON");
  char *limit = getenv("REA_VERIFY_LIMIT_OPTION");
  char *helper = getenv("REA_NONDUMPABLE_HELPER");
  if (python == NULL || python[0] != '/' || limit == NULL || helper == NULL ||
      helper[0] != '/') {
    fputs("limited Python fixture requires an absolute Python, limit, and helper\n",
          stderr);
    return 127;
  }
  struct rlimit core = {1, 1}; // 1 byte discards piped dumps; 0 still reaches them.
  if (setrlimit(RLIMIT_CORE, &core) != 0) {
    perror("setrlimit");
    return 127;
  }
  /* The helper disarms inside the exec'd interpreter, then runs the original
   * arguments there. A launcher prctl would not survive that exec. */
  char **arguments = calloc((size_t)argc + 6, sizeof(char *));
  if (arguments == NULL) return 127;
  arguments[0] = "/usr/bin/prlimit";
  arguments[1] = limit;
  arguments[2] = "--";
  arguments[3] = python;
  arguments[4] = helper;
  arguments[5] = "--forward";
  for (int index = 1; index < argc; index++) arguments[index + 5] = argv[index];
  pid_t child = fork();
  if (child == 0) {
    execv(arguments[0], arguments);
    perror("execv");
    _exit(127);
  }
  free(arguments);
  if (child < 0) {
    perror("fork");
    return 127;
  }
  int status;
  while (waitpid(child, &status, 0) < 0) {
    if (errno == EINTR) continue;
    perror("waitpid");
    return 127;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) {
    /* Re-raise in this process. Dumpable must be cleared here, after no exec. */
    if (prctl(PR_SET_DUMPABLE, 0) != 0) {
      perror("prctl");
      return 127;
    }
    int signum = WTERMSIG(status);
    signal(signum, SIG_DFL);
    sigset_t signals;
    sigemptyset(&signals);
    sigaddset(&signals, signum);
    sigprocmask(SIG_UNBLOCK, &signals, NULL);
    raise(signum);
    return 128 + signum;
  }
  return 127;
}
