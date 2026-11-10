# L3公开契约、兼容与视觉计划

用户本轮已确认L3范围和公共测试边界并显式调用三技能。基线6a8e512。只做核对、首次冻结、订正、新轮和历史，不进入其他模块。

视觉沿用纸面#ffffff、背景#f4f6f8、正文#192c36、次字#536771、操作#176c63、边线#d8e1e5；中文Microsoft YaHei UI、英文Georgia。左对齐，结果以文本与逐行反馈表达，颜色仅辅助，不做成绩仪表盘。

```text
目标填号 / 自动保存状态
第N轮 [核对答案或核对订正] [开始新一轮] [练习历史]
首次：正确1 / 已填2，50%  （订正单独标注）
原序目标 / 当前输入 / 上次核对反馈 / 按需展开答案原句
```

自检：保留已认可的两列工作台，只有结果和历史与当前任务相关。不加常驻导出/刷新管理，历史在独立只读dialog里，不把旧轮输入回填当前轮。窄桌面允许工具栏换行、历史滚动，保留输入可达。

公共seam：`checkAnswers(definition,rawInputs)`→正确/已填/错填/未对应答案/逐行反馈；非法语法或无有效号抛带issues的错误。独立人工字面夹具先红后绿。definition含targets[{id,correctNumbers,occurrences}]及固定版本。

`openListeningPractice({directory,materials,definitions,legacy,append?,clock?})`返回read/readDrafts/saveDraft/apply/export/close。legacy是真实既有草稿Store，同一练习队列串行处理旧稿保存、核对及新轮；append/clock是系统边界。练习POST操作{operationId,type:first|correction|newRound,materialId,roundId,expectedRevision,expectedDraftRevision}，服务器从已存草稿形成完整快照，不相信客户端传来的分数。GET读轮次/首次/订正/各轮草稿及固定定义。HTTP使用storeId与同源JSON门禁。

兼容：原L1草稿作为确定性initial轮使用，不修改或重写已有v1事件。首次/订正之前之后该initial轮仍可正常追加既有草稿；第一次新轮将前轮最新输入完整归档，新轮及后续草稿写独立listening-practice.jsonl，旧文件保留。草稿API维持原body，GET增加roundId，L3客户端通过X-Practice-Round-Id固定写入轮；无轮标识的旧客户端仅在该材料尚无练习事件时兼容，之后明确拒绝，防止旧标签把新轮当原稿。每材料草稿revision跨轮单调递增。相同操作先判幂等，不同旧窗口不能复用首次或新轮。首次结果固定，订正事件单独追加。旧程序不可作为L3数据安全降级写者。

存储：独立事件含type、输入操作、固定definition、首次/订正结果或新轮前稿。重开校验版本/hash、快照计算、引用/轮次/修订链；坏尾行、未知格式、部分写入失败保全并拒绝继续，不清零。与次数事件分开。原音、六份data和L1草稿/计数Store原模块不改。

浏览器保全：沿用既有草稿outbox，补固定roundId；L3动作另有每标签session待办及唯一local备份。未确认动作锁填写和新动作，失败可重试同ID，冲突需明确采用远端。换轮只有成功回执后刷新当前输入；迟到旧回执不跨轮覆盖。页面关闭提示需同时覆盖两类待办，不能为浏览器脚本去掉beforeunload。

评分规则按准备文件已确认：多次事件号、?独立待确认、同目标重复去重提示、跨目标重号分别判、超篇事件正整数算错填；0/负数/小数/无效字符/超安全整数阻核对，空白和问号不计分母，无数字不冻0%。未对应不等于未听懂，不把首次核对称首遍听力。答案副本源于既有key并登记SHA，不重新生成教材。


## 实现补充

新轮及明确采用不同当前轮后，清除旧片段、原音回0并暂停；普通刷新初始读取仍保留已有进度。历史dialog关闭返回入口焦点，非法输入返回原框；结果颜色只是辅助，文字说明统计口径。composition自动化为系统事件边界，不冒称真人IME验证。

GET /api/listening/practice返回{storeId,revision,materials:{id:{revision,currentRoundId,rounds:[{id,createdAt,first,corrections,draft}]}}}。首次/订正快照含operationId/checkedAt/definition/answers/context/voice/draftRevision/result，历史读取验证固定答案targets的SHA256与answerVersion一致。POST /api/listening/practice/operations遵循上文六字段，同ID先幂等，过期round/练习修订/草稿修订返回409 PRACTICE_CONFLICT。草稿API原body保持，通过X-Practice-Round-Id固定目标轮；缺失仅在无练习事件的初始轮兼容，之后409 DRAFT_CONFLICT。私有practice-store/check源码及事件文件不可静态访问。

/api/listening/drafts/export保留原format/version/events，同时view是当前轮投影，新增practice为完整练习保全；接口不能当作听力页面导出。旧初始轮文件原行不变，不复制旧Readest类型/实现，不迁移旧Readest学习库。新格式如出现旧程序不能理解的文件，不能将旧程序称安全回退写者。

失效操作和冲突不自动改成订正；查看远端不解除待办，明确采用才解除。采用远端保留既有confirm和输入锁。核对已确认后按operationId清理同一操作的旧标签备份，其他待办不清。原L1草稿本地待办恢复按initial轮绑定，服务器新轮会拒绝旧轮重放，避免覆盖。

后续仍保留L2 V01真实后台及V02真人声学听辨未验证，L3未补作这两项认证；四种桌面缩窗不算手机适配。
