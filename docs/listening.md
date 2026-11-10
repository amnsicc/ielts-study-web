# L1公开边界与实施前设计

L1只实现工作台/固定音频/原序多号草稿，不包含选段循环、评分、首次结果及订正历史。原稿默认收起、显隐独立；既有阅读会话/页面默认参数保持兼容。

视觉沿用底色#f4f6f8、纸面#ffffff、正文#192c36、次字#536771、操作#176c63、边线#d8e1e5；中文Microsoft YaHei UI，英文Georgia。左对齐的学习工作台，左侧词表与播放器/原稿，右侧原序填号。用原编号做导航，不加统计卡片和装饰。左右可拖，左侧上下可拖；窄桌面允许整体滚动以保证播放器和输入可达，不声明手机适配。复核后沿用既有视觉，重点放在音频/草稿/词表同时可用。

```text
词表 / 筛选 / 计数       | 目标原编号 / 英文 / 原序号输入
----- 可调分隔 --------- | 中文按需展开
材料 / 原声 / 播放控件   | 草稿状态 / 重试 / 冲突处理
原稿开关 / 原稿          | 导出草稿
```

数据：listening-catalog.json为听力选义；listening-materials.json是两篇固定原文、实际目标及各自voices；audio/仅发布原MP3副本。阅读data不改。对象ID和阅读同名但记录module=listening。

createReadingSession/catalog材料接口增加可选第三参数module，默认reading。readingView可选配置module、materialChanged、reset等回调；默认不改变阅读。听力内部组合这个现有公开会话/词表，不复制Store或改写阅读数据。

草稿Store openListeningDrafts({directory,materials,append?,clock?}) 返回read/apply/export/close。由主服务先持有记录目录writer.lock，再打开草稿Store；草稿Store不作为可并行独立进程写者，公开测试需独立目录单实例。初始化失败释放本次资源，stop先排空请求/草稿再释放主锁。

POST /api/listening/drafts/operations：{operationId,materialId,version,expectedRevision,answers,context}。answers是entryId到原字符串的完整快照（每项<=1000字符），context={voiceId,position}；position非负且不超过该录音时长。材料version绑定固定正文/目标身份，不能把别版答案套用；每材料revision独立。未包含目标视为空字符串，未知目标拒绝。字段严格校验。草稿保存是原始输入，不校验计分语法。

GET /api/listening/drafts 返回{revision,drafts:{materialId:{revision,version,answers,context,updatedAt,lastOperationId}}}；GET /api/listening/drafts/export 返回format/version/events/view。append-only listening-drafts.jsonl事件formatVersion=1，持久化sync后确认；同ID同规范化内容幂等、异内容拒绝；过期expectedRevision返回DRAFT_CONFLICT/409，不覆盖。尾行不全/坏文件/未知版本拒绝并保全；写中失败锁定Store而不继续追加，写前失败可重试。草稿事件不混入study-events.jsonl。

浏览器使用每标签sessionStorage待办清单（独立标签不争抢覆盖），同步保存输入快照和不可变待发操作，再延迟自动提交。sessionStorage在同标签刷新/浏览器恢复该标签时可保全；正常关闭后新开标签仅恢复服务已确认草稿，未确认输入另写每标签唯一localStorage备份供重开发现与恢复，不能共享一个key互相覆盖。浏览器存储写入失败必须提示，服务已确认后才移除对应本地待办。服务端给dataStoreId隔离不同记录目录，不能把旧目录本地待办重放到另一目录。首次读取失败不把空稿当真，禁用填写并给重试。

保存中的新输入单独保留，旧回执只更新已确认基准；不能回填覆盖新文字。冲突保留本地稿及最新远端稿，提供下载本地稿、查看远端、确认采用远端（丢弃本地需明确操作）；L1不提供盲目强制覆盖。其他材料不受单篇冲突阻塞。退出/刷新提示待办，既有浏览器恢复限制写入README，不承诺强杀最后输入零丢失。

音频GET/HEAD支持单字节Range、suffix、416，MIME audio/mpeg。仅白名单原音副本可访问，私有Store/草稿文件不可静态访问。POST沿用本机Origin/JSON/请求体上限防护。素材不向外发送。

复用公开会话/真实页面、HTTP及草稿Store为已确认测试边界。故障只注入append或HTTP适配，不在产品加故障控制。测试全用新目录人造数据，不碰用户4187或.local-data。


HTTP提交另须X-Data-Store-Id等于GET返回身份，拒绝跨数据目录待办重放。幂等旧操作回执若发现远端lastOperationId已经变为后续操作，不能把其修订号当成本地新输入的自动提交基准；有新输入时保留并提示冲突，无新输入时恢复远端最新视图。
