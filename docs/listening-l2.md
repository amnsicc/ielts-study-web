# L2实施契约与视觉准备

本轮用户显式调用三技能并确认L2公共边界，基线9f59ec7。只增加完整单词选段单播与循环，不进入L3。

## 视觉计划及自检
沿用已认可学习纸面：底色#f4f6f8、纸面#ffffff、文字#192c36、次字#536771、操作#176c63、边线#d8e1e5。中文Microsoft YaHei UI，原稿Georgia；左对齐。新选区用浅蓝#d9ebfa及深蓝文字区分目标词原有绿色高亮。

```text
原音 / 回退N秒 / 倍速 / 从头 / 原稿开关
[选中的完整文字（长段可滚动）]  单播状态
[播放选段一次] [循环选段] [退出选段]  ← 有选区才显示
原稿正文（原来的布局和目标查义）
```

复核：不加通用仪表盘、装饰、统计或常驻管理按钮；操作条只回答“选了哪里、现在怎么播”。三按钮用现有样式，循环激活显示aria-pressed。长选择摘要限制高度但可以滚动、保留全文；窄桌面正常换行，不挤掉原稿。重点是原稿高亮直接反馈完整词边界，不重新设计已经验收的界面。

## 已确认公共入口具体接口
- `resolveWordSelection(material, mapping, voiceId, {paragraphIndex,offset}, {paragraphIndex,offset})`：输入正文UTF-16字符端点（方向任意），返回null或{first,last,text,start,end,words}。返回text来自实际位置的完整词及中间正文，start/end为该声音秒数。空白/标点不播放，越界或无声轴抛出明确异常。选段规则通过独立人工短文和字面预期验证。
- `validateWordMapping(material,mapping,voiceId,{textSha256,audioSha256})`：核对版本/hash、完整词字符范围及逐voice单调正时长/录音边界；失败抛错，UI保留整篇原音与草稿。
- `createClipPlayer(media,{onChange,schedule,cancel})`：媒体是HTMLMediaElement系统边界，定时器是时钟系统边界。返回select(range)/play(mode)/clear()/rewind(seconds)/snapshot()/dispose()，mode=once或loop。snapshot暴露所选范围、mode和phase；play不叠加调度，pause事件保留模式，主动整篇seek清模式。clear暂停。dispose取消调度及媒体监听。
- 浏览器真实Range适配及真实audio事件/进度是端到端边界；不以内部变量或测试专用产品API验证。测试只在脚本创建临时服务/记录目录及外部网络拦截注入错误。

映射独立生成data/listening-word-map.json及其来源清单；不改既有材料version、草稿Store、事件或原MP3。逐词时间来自每份speech-events，绑定本声音和本原稿hash。浏览器校验发布数据及实际音频字节；故障禁用选段，不能套用别的声音。单播/循环用前台短周期检查及预测结束计时，后台暂停；不宣称所有机器无毫秒误差或真人逐音认证。

TDD按一个公共行为一个红绿小节推进；真实浏览器需补充鼠标/键盘跨节点、三声音/倍速及取消旧播放；开发日志和可复听原音截段随交付提供。历史R1取消五按钮保持。所有测试禁用4187与用户数据。


## 实现后的补充说明
原稿段落可Tab聚焦，Shift方向键通过浏览器Selection.modify选择字符/行，Ctrl+Shift左右按完整词导航；其后Tab到播放按钮。选段条出现时，按真实播放器/工具栏高度计算正文最小高度；左侧必要时整体滚动，四种桌面窗口正文与控件均可达，非手机适配。

clear(pause=true)的可选false只用于主动整篇seek：清掉片段但保留用户原播放状态。媒体error也取消旧片段。映射每次选声/篇重新读取和校验，晚到的旧加载不覆盖当前声音，不自动发声。

验证边界如实记录：无头Chrome最小化/切标签不产生document.hidden变化，因此用外部visibilitychange边界注入验证暂停/不自动继续，不能冒称有头浏览器后台听感认证。原音截段样本只按相同时间从原MP3解码导出，不是扬声器录制。仍需用户或独立验收真人复听检查首尾声学完整性，不把全部hash/计时通过称作逐音质量通过。
