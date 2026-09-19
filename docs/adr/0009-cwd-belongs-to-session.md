# cwd 属于 Session

dsh initialize 不再绑死整棵进程的工作目录。项目选了文件夹，该 Session header 用项目路径；没选则回落成员身份目录。cwd 变化才重启 SDK 子进程。
