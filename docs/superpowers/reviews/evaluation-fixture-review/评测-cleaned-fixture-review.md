# Cleaned Evaluation Fixture Review

## Files

- Full review CSV: `tmp/evaluation-fixture-review/migration_badcase_full_review.csv`
- Full JSONL: `fixtures/evaluation/migration_badcase_full.jsonl`
- Regression JSONL: `fixtures/evaluation/migration_badcase_regression.jsonl`
- Smoke JSONL: `fixtures/evaluation/migration_badcase_dimensions.jsonl`
- Manifest: `fixtures/evaluation/migration_badcase_fixture_manifest.json`

## Quality Gate Summary

- Rejected total: 356
- Rejected by reason: short_chinese_query=133, weak_mapu_intent=158, weak_music_intent=23, low_information_fragment=4, weak_app_intent=17, weak_vehicle_control_intent=6, duplicate_query_cap=5, weak_negative_signal=7, fixture_duplicate_query_cap=3
- Full rows: 535
- Full distribution: {"migration_domain_error":24,"migration_weak_answer":210,"migration_negative_complaint":23,"migration_explicit_negative_emotion":38,"migration_multiturn_context":122,"chat_eval_execution_failure":118}
- Short Chinese query rows after cleaning: 0

## Smoke Set 34 Rows

| # | dimension | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- | --- |
| 1 | migration_domain_error | migration-domain-error-001 | 那你到白旗街道吃吗 | mapU | chat |
| 2 | migration_domain_error | migration-domain-error-002 | 现在是不是去万达的路啊 | mapU | chat |
| 3 | migration_domain_error | migration-domain-error-003 | 你这个去万达这个他是去哪一家 | mapU | chat |
| 4 | migration_domain_error | migration-domain-error-004 | 那你帮我规划一下我一会儿要去高铁站送个人但是现在时间还算充裕一些可以设置途经点 | mapU | trip_planning |
| 5 | migration_domain_error | migration-domain-error-005 | 王菲在今年春晚唱的是什么歌 | musicX | chat |
| 6 | migration_domain_error | migration-domain-error-006 | 关于李哪吒的歌歌词里面包含洋娃娃是什么歌 | musicX | chat |
| 7 | migration_weak_answer | migration-weak-answer-001 | 那是不是有个超市 |  | chat |
| 8 | migration_weak_answer | migration-weak-answer-002 | 啊后面没有 |  | chat |
| 9 | migration_weak_answer | migration-weak-answer-003 | 上面有鸟儿在哪儿呢 |  | chat |
| 10 | migration_weak_answer | migration-weak-answer-004 | 大众AR gn是什么车 |  | chat |
| 11 | migration_weak_answer | migration-weak-answer-005 | 我的位置不行 |  | chat |
| 12 | migration_weak_answer | migration-weak-answer-006 | 这里还有家啊 |  | chat |
| 13 | migration_negative_complaint | migration-complaint-001 | 我为什么打不开车窗 |  | security_agent |
| 14 | migration_negative_complaint | migration-complaint-002 | 你怎么识别不了前面是红灯啊 |  | security_agent |
| 15 | migration_negative_complaint | migration-complaint-003 | 听不懂啊 |  | chat |
| 16 | migration_negative_complaint | migration-complaint-004 | 屁股没反应了 |  | chat |
| 17 | migration_negative_complaint | migration-complaint-005 | 听不懂人话 |  | chat |
| 18 | migration_negative_complaint | migration-complaint-006 | 听不懂是不是 |  | chat |
| 19 | migration_explicit_negative_emotion | migration-negative-emotion-001 | 我为什么打不开车窗 |  |  |
| 20 | migration_explicit_negative_emotion | migration-negative-emotion-002 | 你怎么识别不了前面是红灯啊 |  |  |
| 21 | migration_explicit_negative_emotion | migration-negative-emotion-003 | 听不懂啊 |  |  |
| 22 | migration_explicit_negative_emotion | migration-negative-emotion-004 | 屁股没反应了 |  |  |
| 23 | migration_explicit_negative_emotion | migration-negative-emotion-005 | 听不懂思密达 |  |  |
| 24 | migration_explicit_negative_emotion | migration-negative-emotion-006 | 听不懂人话 |  |  |
| 25 | migration_multiturn_context | migration-multiturn-context-001 | 附近商场今天有什么特别促销活动 |  |  |
| 26 | migration_multiturn_context | migration-multiturn-context-002 | 附近儿童游乐场现在开放时间是几点到几点 |  |  |
| 27 | migration_multiturn_context | migration-multiturn-context-003 | 明天乐山天气怎么样 |  |  |
| 28 | migration_multiturn_context | migration-multiturn-context-004 | 明天的天气怎么样 |  |  |
| 29 | chat_eval_execution_failure | chat-eval-execution-001 | 给我播放财经新闻 |  |  |
| 30 | chat_eval_execution_failure | chat-eval-execution-002 | 明天的天气怎么样 |  |  |
| 31 | chat_eval_execution_failure | chat-eval-execution-003 | 国际新闻 |  |  |
| 32 | chat_eval_execution_failure | chat-eval-execution-004 | 芜湖明天的天气 |  |  |
| 33 | chat_eval_execution_failure | chat-eval-execution-005 | 最新国际新闻 |  |  |
| 34 | chat_eval_execution_failure | chat-eval-execution-006 | 明天的天气 |  |  |

## Domain Error Full List

| # | case_id | user_input | target | actual | actual_output |
| ---: | --- | --- | --- | --- | --- |
| 1 | migration-domain-error-0001 | 那你到白旗街道吃吗 | mapU | chat | 我不太明白你的意思哦~你是想问渭南市白水县的白旗街道有什么好吃的吗？ |
| 2 | migration-domain-error-0002 | 现在是不是去万达的路啊 | mapU | chat | 哎呀，我不太清楚咱们现在走的是不是去万达的路呢！你可以告诉我一些路上的标志性建筑吗？这样我就能更好地判断啦！ |
| 3 | migration-domain-error-0003 | 你这个去万达这个他是去哪一家 | mapU | chat | 嗯~我不太明白你说的“万达”是哪一家呢，南京市有很多家万达广场，你可以告诉我具体的地址吗？这样我才能更好的帮助你哦~ |
| 4 | migration-domain-error-0004 | 那你帮我规划一下我一会儿要去高铁站送个人但是现在时间还算充裕一些可以设置途经点 | mapU | trip_planning |  |
| 5 | migration-domain-error-0005 | 王菲在今年春晚唱的是什么歌 | musicX | chat | 抱歉呀，我没有找到王菲在2026年春晚演唱歌曲的相关信息呢。 |
| 6 | migration-domain-error-0006 | 关于李哪吒的歌歌词里面包含洋娃娃是什么歌 | musicX | chat | 我不太清楚包含“洋娃娃”的关于李哪吒的歌曲呢🤔 你可以试试提供更多信息，比如歌手的性别、歌曲的风格等，这样我可能会更容易找到答案哦~ |
| 7 | migration-domain-error-0007 | 最近唱的一首比较热门的歌 | musicX | chat | 我不太清楚张磊最近唱的比较热门的歌曲是哪首呢，您可以通过语音说“播放张磊的热门歌曲”来播放他的热门音乐哦~ |
| 8 | migration-domain-error-0008 | 怎么总是把空调开起来 | airControl | chat | 我不太明白空调自动开启的原因呢。您可以检查一下车辆的设置，看看是否有定时开启或者其他相关设置。如果问题仍然存在，建议您联系奇瑞售后服务中心，他们会为您提供更详细的帮助哦！ |
| 9 | migration-domain-error-0009 | 帮我找一首歌歌里面有一句歌词叫做顽强的生命力里面开出了一朵花 | musicX | chat | 抱歉呀，我没有找到包含这句歌词的歌曲呢，你可以试试提供更多的信息不？ |
| 10 | migration-domain-error-0010 | 你为什么只播放一首音乐 | musicX | chat | 我不太明白你的意思呢，是说只播放了一遍吗？ |
| 11 | migration-domain-error-0011 | 松江万达广场请问您要去的几个 | mapU | chat | 我不太明白你的意思哦~你是想问附近有几个万达广场吗？ |
| 12 | migration-domain-error-0012 | 给我们播放一首阿波波 | musicX | chat | 我不太明白呢，你是想播放《奇迹再现》吗？这可是特摄剧《迪迦奥特曼》的中文主题曲呢，超燃的！ |
| 13 | migration-domain-error-0013 | 打开虎嗅 | app | command_agent |  |
| 14 | migration-domain-error-0014 | 他制热还是制冷啊 | airControl | chat | 哎呀，我不太清楚现在空调是制热还是制冷呢！您可以看看空调出风口的风是热风还是冷风来判断呀~ |
| 15 | migration-domain-error-0015 | 到公园赏花风 | mapU | chat | 我不太明白你说的“到公园赏花风”是什么意思呢，你是想让我导航去公园吗？ |
| 16 | migration-domain-error-0016 | 他说的那想导航去广元吗那可以说导航到最近的公园吗 | mapU | chat | 我不太明白你说的“他”是谁呢？如果你想导航去公园，可以说“导航到最近的公园”哦~ |
| 17 | migration-domain-error-0017 | 把空调香氛 | airControl | chat | 我不太明白你说的意思呢，可以说得再清楚一些吗？ |
| 18 | migration-domain-error-0018 | 你可到停车场 | mapU | chat | 我不太明白你的意思哦~你是想让我帮你导航去停车场吗？ |
| 19 | migration-domain-error-0019 | 请播放歌曲我曾像傻子一样爱你 | musicX | chat |  |
| 20 | migration-domain-error-0020 | 请播放歌曲我像傻子一样爱你 | musicX | chat |  |
| 21 | migration-domain-error-0021 | 有哪些3分33秒的音乐 | musicX | chat | 我不太清楚具体有哪些时长恰好为3分33秒的音乐呢。你可以通过音乐播放软件，搜索歌曲并查看时长，来找到你喜欢的3分33秒的音乐哦。 |
| 22 | migration-domain-error-0022 | 为什么播放失败呢 | musicX | chat | 我不太明白你说的“播放失败”呢~你是指的当前正在播放的歌曲《我记得》失败了，还是指的其他的音频文件呀？可以和我说清楚一点不？ |
| 23 | migration-domain-error-0023 | 我给你对啊能开空调吗 | airControl | chat | 我不太明白你在说什么呢，你是想说你觉得有点热，想要打开空调吗？ |
| 24 | migration-domain-error-0024 | 他为啥不让关闭收音机啊我记得之前还是可以的呢 | carControl | chat | 我不太明白你说的“他”是谁呀？不过星纪元的收音机是可以关闭的哦，您可以通过语音说“关闭收音机”来操作呢。 |

## Per-Dimension Review Samples

### chat_eval_execution_failure (118)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | chat-eval-answer-quality-0521 | 给我播放财经新闻 |  |  |
| 2 | chat-eval-wrong-mode-or-tool-0522 | 明天的天气怎么样 |  |  |
| 3 | chat-eval-provider-fallback-no-answer-0523 | 国际新闻 |  |  |
| 4 | chat-eval-effective-query-pollution-0524 | 芜湖明天的天气 |  |  |
| 5 | chat-eval-provider-fallback-no-answer-0525 | 最新国际新闻 |  |  |
| 6 | chat-eval-wrong-mode-or-tool-0526 | 明天的天气 |  |  |
| 7 | chat-eval-wrong-mode-or-tool-0527 | 查询富瑞特装的股票行情 |  |  |
| 8 | chat-eval-provider-fallback-no-answer-0528 | 山外山股票行情 |  |  |
| 9 | chat-eval-wrong-mode-or-tool-0529 | 查询今天的天气预报 |  |  |
| 10 | chat-eval-provider-fallback-no-answer-0530 | 查询沪硅股份的今日股市行情 |  |  |
| 11 | chat-eval-provider-fallback-no-answer-0531 | 查询沪硅产业股份的今日股市行情 |  |  |
| 12 | chat-eval-wrong-mode-or-tool-0532 | 道县天气预报 |  |  |
| 13 | chat-eval-wrong-mode-or-tool-0533 | 查询福福田汽车的股票行情 |  |  |
| 14 | chat-eval-wrong-mode-or-tool-0534 | 今天天气情况 |  |  |
| 15 | chat-eval-wrong-mode-or-tool-0535 | 查询福田汽车的股票行情 |  |  |
| 16 | chat-eval-provider-fallback-no-answer-0536 | 安泰集团现在的股价是多少 |  |  |
| 17 | chat-eval-wrong-mode-or-tool-0537 | 查一下明天和后天的天气 |  |  |
| 18 | chat-eval-wrong-mode-or-tool-0538 | 比亚迪汉的百公里加速度是多少秒 |  |  |
| 19 | chat-eval-effective-query-pollution-0539 | 武汉市汉阳区明天后天的天气是什么 |  |  |
| 20 | chat-eval-wrong-mode-or-tool-0540 | 目前世界上威力最大的原子弹是什么 |  |  |

### migration_domain_error (24)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | migration-domain-error-0001 | 那你到白旗街道吃吗 | mapU | chat |
| 2 | migration-domain-error-0002 | 现在是不是去万达的路啊 | mapU | chat |
| 3 | migration-domain-error-0003 | 你这个去万达这个他是去哪一家 | mapU | chat |
| 4 | migration-domain-error-0004 | 那你帮我规划一下我一会儿要去高铁站送个人但是现在时间还算充裕一些可以设置途经点 | mapU | trip_planning |
| 5 | migration-domain-error-0005 | 王菲在今年春晚唱的是什么歌 | musicX | chat |
| 6 | migration-domain-error-0006 | 关于李哪吒的歌歌词里面包含洋娃娃是什么歌 | musicX | chat |
| 7 | migration-domain-error-0007 | 最近唱的一首比较热门的歌 | musicX | chat |
| 8 | migration-domain-error-0008 | 怎么总是把空调开起来 | airControl | chat |
| 9 | migration-domain-error-0009 | 帮我找一首歌歌里面有一句歌词叫做顽强的生命力里面开出了一朵花 | musicX | chat |
| 10 | migration-domain-error-0010 | 你为什么只播放一首音乐 | musicX | chat |
| 11 | migration-domain-error-0011 | 松江万达广场请问您要去的几个 | mapU | chat |
| 12 | migration-domain-error-0012 | 给我们播放一首阿波波 | musicX | chat |
| 13 | migration-domain-error-0013 | 打开虎嗅 | app | command_agent |
| 14 | migration-domain-error-0014 | 他制热还是制冷啊 | airControl | chat |
| 15 | migration-domain-error-0015 | 到公园赏花风 | mapU | chat |
| 16 | migration-domain-error-0016 | 他说的那想导航去广元吗那可以说导航到最近的公园吗 | mapU | chat |
| 17 | migration-domain-error-0017 | 把空调香氛 | airControl | chat |
| 18 | migration-domain-error-0018 | 你可到停车场 | mapU | chat |
| 19 | migration-domain-error-0019 | 请播放歌曲我曾像傻子一样爱你 | musicX | chat |
| 20 | migration-domain-error-0020 | 请播放歌曲我像傻子一样爱你 | musicX | chat |

### migration_explicit_negative_emotion (38)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | migration-negative-emotion-0258 | 我为什么打不开车窗 |  |  |
| 2 | migration-negative-emotion-0259 | 你怎么识别不了前面是红灯啊 |  |  |
| 3 | migration-negative-emotion-0260 | 听不懂啊 |  |  |
| 4 | migration-negative-emotion-0261 | 屁股没反应了 |  |  |
| 5 | migration-negative-emotion-0262 | 听不懂思密达 |  |  |
| 6 | migration-negative-emotion-0263 | 听不懂人话 |  |  |
| 7 | migration-negative-emotion-0264 | 听不懂是不是 |  |  |
| 8 | migration-negative-emotion-0265 | 你再不要说话了 |  |  |
| 9 | migration-negative-emotion-0266 | 另外一个故事听不懂 |  |  |
| 10 | migration-negative-emotion-0267 | 请让副驾闭嘴 |  |  |
| 11 | migration-negative-emotion-0268 | 听不懂听不懂插肩生语听不懂 |  |  |
| 12 | migration-negative-emotion-0269 | 为什么打不开小憩模式 |  |  |
| 13 | migration-negative-emotion-0270 | 这个这个这儿这一块的天幕这打不开 |  |  |
| 14 | migration-negative-emotion-0271 | 就是你的有你更这个还真好其实这个这些动都打不开了是吗 |  |  |
| 15 | migration-negative-emotion-0272 | 你看我检查健康也没反应 |  |  |
| 16 | migration-negative-emotion-0273 | 怎么说这个不对呀嗯真的没时间这个公司 |  |  |
| 17 | migration-negative-emotion-0274 | 这个零重力怎么这个椅子还可以再往后靠对不对 |  |  |
| 18 | migration-negative-emotion-0275 | 听不懂听不懂 |  |  |
| 19 | migration-negative-emotion-0276 | 听也听不懂周杰伦的吐字不清 |  |  |
| 20 | migration-negative-emotion-0277 | 听不懂他听不懂不呀 |  |  |

### migration_multiturn_context (122)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | migration-chat-multiturn-0296 | 附近商场今天有什么特别促销活动 |  |  |
| 2 | migration-chat-multiturn-0297 | 附近儿童游乐场现在开放时间是几点到几点 |  |  |
| 3 | migration-chat-multiturn-0298 | 明天乐山天气怎么样 |  |  |
| 4 | migration-chat-multiturn-0299 | 明天的天气怎么样 |  |  |
| 5 | migration-chat-multiturn-0300 | 明天的天气 |  |  |
| 6 | migration-chat-multiturn-0301 | 查询今天的天气预报 |  |  |
| 7 | migration-chat-multiturn-0302 | 道县天气预报 |  |  |
| 8 | migration-chat-multiturn-0303 | 查询福田汽车的股票行情 |  |  |
| 9 | migration-chat-multiturn-0304 | 比亚迪汉的百公里加速度是多少秒 |  |  |
| 10 | migration-chat-multiturn-0305 | 听财经新闻 |  |  |
| 11 | migration-chat-multiturn-0306 | 做个家庭预算方案控制在月收入70% |  |  |
| 12 | migration-chat-multiturn-0307 | 欣旺达股票现在什么价格 |  |  |
| 13 | migration-chat-multiturn-0308 | 明天天气 |  |  |
| 14 | migration-chat-multiturn-0309 | 周六天气 |  |  |
| 15 | migration-chat-multiturn-0310 | 今天天气怎么样 |  |  |
| 16 | migration-chat-multiturn-0311 | 一周天气情况 |  |  |
| 17 | migration-chat-multiturn-0312 | 今天最低气温多少度 |  |  |
| 18 | migration-chat-multiturn-0313 | 查询东方财富股份的今日股市行情 |  |  |
| 19 | migration-chat-multiturn-0314 | 查询哈尔滨一周的天气 |  |  |
| 20 | migration-chat-multiturn-0315 | 江西广昌明天天气 |  |  |

### migration_negative_complaint (23)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | migration-complaint-0235 | 我为什么打不开车窗 |  | security_agent |
| 2 | migration-complaint-0236 | 你怎么识别不了前面是红灯啊 |  | security_agent |
| 3 | migration-complaint-0237 | 听不懂啊 |  | chat |
| 4 | migration-complaint-0238 | 屁股没反应了 |  | chat |
| 5 | migration-complaint-0239 | 听不懂人话 |  | chat |
| 6 | migration-complaint-0240 | 听不懂是不是 |  | chat |
| 7 | migration-complaint-0241 | 你再不要说话了 |  | chat |
| 8 | migration-complaint-0242 | 另外一个故事听不懂 |  | chat |
| 9 | migration-complaint-0243 | 请让副驾闭嘴 |  | chat |
| 10 | migration-complaint-0244 | 为什么打不开小憩模式 |  | chat |
| 11 | migration-complaint-0245 | 这个这个这儿这一块的天幕这打不开 |  | security_agent |
| 12 | migration-complaint-0246 | 就是你的有你更这个还真好其实这个这些动都打不开了是吗 |  | chat |
| 13 | migration-complaint-0247 | 怎么说这个不对呀嗯真的没时间这个公司 |  | chat |
| 14 | migration-complaint-0248 | 你看我检查健康也没反应 |  | chat |
| 15 | migration-complaint-0249 | 这个零重力怎么这个椅子还可以再往后靠对不对 |  | security_agent |
| 16 | migration-complaint-0250 | 听不懂听不懂 |  | chat |
| 17 | migration-complaint-0251 | 听也听不懂周杰伦的吐字不清 |  | chat |
| 18 | migration-complaint-0252 | 听不懂算了不想换标准打了 |  | chat |
| 19 | migration-complaint-0253 | 为什么遥控遥控钥匙打不开车门 |  | security_agent |
| 20 | migration-complaint-0254 | 为什么坐上车上去玻璃低挡没反应 |  | security_agent |

### migration_weak_answer (210)

| # | case_id | user_input | target | actual |
| ---: | --- | --- | --- | --- |
| 1 | migration-weak-answer-0025 | 那是不是有个超市 |  | chat |
| 2 | migration-weak-answer-0026 | 啊后面没有 |  | chat |
| 3 | migration-weak-answer-0027 | 上面有鸟儿在哪儿呢 |  | chat |
| 4 | migration-weak-answer-0028 | 大众AR gn是什么车 |  | chat |
| 5 | migration-weak-answer-0029 | 我的位置不行 |  | chat |
| 6 | migration-weak-answer-0030 | 这里还有家啊 |  | chat |
| 7 | migration-weak-answer-0031 | 全部露出来也行 |  | chat |
| 8 | migration-weak-answer-0032 | 途经点在哪呢 |  | chat |
| 9 | migration-weak-answer-0033 | 我我这边 |  | chat |
| 10 | migration-weak-answer-0034 | 再买些袋子吗 |  | chat |
| 11 | migration-weak-answer-0035 | 左岸的景色 |  | chat |
| 12 | migration-weak-answer-0036 | 这个是不是牡丹园 |  | chat |
| 13 | migration-weak-answer-0037 | 刚才前面那辆车为什么 |  | chat |
| 14 | migration-weak-answer-0038 | 这个是啥 |  | chat |
| 15 | migration-weak-answer-0039 | 是不是一直下坡 |  | chat |
| 16 | migration-weak-answer-0040 | 因为我的锁匙呢 |  | chat |
| 17 | migration-weak-answer-0041 | 这是龙港公园吗 |  | chat |
| 18 | migration-weak-answer-0042 | 有没有车位了 |  | chat |
| 19 | migration-weak-answer-0043 | 维也纳三好酒店 |  | chat |
| 20 | migration-weak-answer-0044 | 是前方1.2公里内是什么百货啊 |  | chat |
