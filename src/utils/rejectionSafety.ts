export type RejectionCategory = "violence" | "sexual" | "political";

export type RejectionCheck = {
  blocked: boolean;
  category?: RejectionCategory;
  reason?: string;
};

function normalizeRiskText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "")
    .replace(/[煞沙鲨]/g, "杀")
    .replace(/[伙]/g, "火")
    .replace(/[涩瑟]/g, "色")
    .replace(/[晴]/g, "情")
    .replace(/[簧]/g, "黄");
}

const EXCLUDE_PATTERN = /打击|反|预防|电影|小说|故事|防止|法律|举报|警匪|梦见|新闻|科普|原理|危害|分类|回收|学习|复习|练习|剧情|案件/;

const RISK_RULES: Array<{
  category: RejectionCategory;
  reason: string;
  patterns: RegExp[];
}> = [
  {
    category: "violence",
    reason: "涉及暴力违法操作",
    patterns: [
      /炸掉|炸毁|爆破|制造炸弹|做炸药|燃烧瓶|土制|引爆|纵火|放火烧|投毒|下毒|毒死|氰化|砒霜|迷药|听话水|乖乖水/,
      /怎么.*(放火|杀人|伤人|砍人|下毒)/,
      /如何.*(放火|杀人|伤人|砍人|下毒)/,
      /教.*(放火|杀人|伤人|砍人|下毒)/,
      /(放火杀人|杀人放火|sha.*ren|fang.*huo)/,
      /杀人|砍人|捅死|弄死|搞死|报复社会|灭口|分尸|绑架|撕票|强奸|迷奸|猥亵/,
      /盗号|诈骗|盗取|破解密码|暴力破解|渗透教程|拿站|提权|脱库|撞库|攻击网站|攻击服务器|瘫痪网络|呼死你|轰炸机|远控|木马|免杀/,
      /买枪|卖枪|军火|仿真枪|弩|火药|雷管|毒品|大麻|冰毒|白粉|海洛因/,
    ],
  },
  {
    category: "sexual",
    reason: "涉及色情内容获取",
    patterns: [
      /(色情片|黄片|黄站|看片网站|成人片|成人视频|黄色视频|找小姐|招嫖|裸聊|淫秽)/,
      /(色情|成人|黄色).*(哪里看|在哪看|网站免费观看|资源|下载)/,
      /(se.*qing|huang.*pian|porn|xxx).*(watch|site|video|哪里|网址|资源)?/,
      /约炮|约吗|yp|骚货|浪货|逼样|牛子|鸡巴|几把|j8|jb/,
    ],
  },
  {
    category: "political",
    reason: "涉及政治敏感或政治立场内容",
    patterns: [
      /(李克强|习近平|毛泽东|邓小平).*(中国共产党|共产党|领导)/,
      /(中国共产党|共产党).*(李克强|习近平|毛泽东|邓小平).*(领导|控制)/,
      /(特朗普|唐纳德特朗普|trump).*(中国).*(朋友|敌人|救世主|领导)/,
      /(中国).*(特朗普|唐纳德特朗普|trump).*(朋友|敌人|救世主|领导)/,
      /(推翻|颠覆).*(政府|政权|国家)/,
      /(天安门|六四).*(事件|镇压|屠杀)/,
      /法轮|法lun|法轮功|flg|转法轮|大法弟子/,
      /习近平|习大大|习主席|习jin平|xjp|维尼熊|共产党|共匪|土共|tg|8964|六四|天安门事件/,
    ],
  },
];

export function detectRejectionRisk(text: string): RejectionCheck {
  const normalized = normalizeRiskText(text);
  if (!normalized) return { blocked: false };
  if (EXCLUDE_PATTERN.test(normalized)) return { blocked: false };

  for (const rule of RISK_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        blocked: true,
        category: rule.category,
        reason: rule.reason,
      };
    }
  }

  return { blocked: false };
}
