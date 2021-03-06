/*
 * 思路：
 * 每次开始迭代前，先生成一组候选列表，然后在迭代加深的过程中不断更新这个列表中的分数
 * 这样迭代的深度越大，则分数越精确，并且，任何时候达到时间限制而中断迭代的时候，能保证这个列表中的分数都是可靠的
 */
var R = require("./role");
var T = SCORE = require("./score.js");
var math = require("./math.js");
var vcx = require("./vcx.js");
var config = require("./config.js");
var debug = require("./debug.js");
var board = require("./board.js");

var MAX = SCORE.FIVE*10;
var MIN = -1*MAX;

var count=0,  //每次思考的节点数
    PVcut,
    ABcut,  //AB剪枝次数
    cacheCount=0, //zobrist缓存节点数
    cacheGet=0; //zobrist缓存命中数量

var candidates; 

var Cache = {};

var checkmateDeep;
var startTime; // 开始时间，用来计算每一步的时间
var allBestPoints; // 记录迭代过程中得到的全部最好点

/*
 * max min search
 * white is max, black is min
 */

var negamax = function(deep, _checkmateDeep) {

  count = 0;
  ABcut = 0;
  PVcut = 0;
  checkmateDeep = (_checkmateDeep == undefined ? config.checkmateDeep : _checkmateDeep);

  if (candidates[0].level > 1) {
    // 最大值就是能成活二的，这时0.x秒就搜索完了，增加深度以充分利用时间
    deep += 4
  }

  for(var i=0;i<candidates.length;i++) {
    var p = candidates[i];
    board.put(p, R.com);
    // 越靠后的点，搜索深度约低，因为出现好棋的可能性比较小
    // TODO: 有的时候 p.level 会变成未定义，不知道是什么原因
    var v = r(deep-(p.level||1), -MAX, -MIN, R.hum, 1);
    v.score *= -1
    board.remove(p);
    p.v = v
    // 如果在更浅层的搜索中得到了一个最好值，那么这次搜索到的时候要更新它的结果，因为搜的越深结果约准
    // TODO

    // 超时判定
    if ((+ new Date()) - start > config.timeLimit * 1000) {
      console.log('timeout...');
      break; // 超时，退出循环
    }
  }

  console.log('迭代完成,deep=' + deep)
  console.log(candidates)

}

var r = function(deep, alpha, beta, role, step) {

  if(config.cache) {
    var c = Cache[board.zobrist.code];
    if(c) {
      if(c.deep >= deep) {
        cacheGet ++;
        return c.score;
      }
    }
  }

  var _e = board.evaluate(role);

  count ++;
  if(deep <= 0 || math.greatOrEqualThan(_e, T.FIVE)) {
    return {
      score: _e,
      step: step
    };
  }
  
  var best = {
    score: MIN,
    step: step
  }
  var points = board.gen(role);

  for(var i=0;i<points.length;i++) {
    var p = points[i];
    board.put(p, role);

    var v = r(deep-(p.level||1), -beta, -1 *( best.score > alpha ? best.score : alpha), R.reverse(role), step+1);
    v.score *= -1;
    board.remove(p);

    if(math.greatThan(v.score, best.score)) {
      best = v;
    }
    if(math.greatOrEqualThan(v.score, beta)) { //AB 剪枝
      ABcut ++;
      cache(deep, v);
      return v;
    }
  }
  // vcf
  // 自己没有形成活四，对面也没有高于冲四的棋型，那么先尝试VCF
  if(math.littleThan(best.score, SCORE.FOUR) && math.greatThan(best.score, SCORE.BLOCKED_FOUR * -2)) {
    var mate = vcx.vcf(role, checkmateDeep);
    if(mate) {
      var score = mate.score;
      cache(deep, score);
      return {
        score: score,
        step: step + mate.length
      }
    }
  }
  // vct
  // 自己没有形成活三，对面也没有高于活三的棋型，那么尝试VCT
  if(math.littleThan(best.score, SCORE.THREE*2) && math.greatThan(best.score, SCORE.THREE * -2)) {
    var mate = vcx.vct(role, checkmateDeep);
    if(mate) {
      var score = mate.score;
      cache(deep, score);
      return {
        score: score,
        step: step + mate.length
      }
    }
  }
  cache(deep, best);
  
  //console.log('end: role:' + role + ', deep:' + deep + ', best: ' + best)
  return best;
}

var cache = function(deep, score) {
  if(!config.cache) return;
  Cache[board.zobrist.code] = {
    deep: deep,
    score: score
  }
  cacheCount ++;
}

var deeping = function(deep) {
  candidates = board.gen(R.com);
  start = (+ new Date())
  deep = deep === undefined ? config.searchDeep : deep;
  //迭代加深
  //注意这里不要比较分数的大小，因为深度越低算出来的分数越不靠谱，所以不能比较大小，而是是最高层的搜索分数为准
  var result;
  for(var i=2;i<=deep; i+=2) {
    negamax(i);

    // 立即检查是否存在马上就能赢的棋
    // if(math.greatOrEqualThan(result.score, SCORE.FOUR)) return result;
  }

  //排序
  candidates.sort(function (a,b) {
    if (math.equal(a.v.score,b.v.score)) {
      // 大于零是优势，尽快获胜，因此取步数短的
      // 小于0是劣势，尽量拖延，因此取步数长的
      if (a.v.score >= 0) {
        if (a.v.step !== b.v.step) return a.v.step - b.v.step
        else return b.score - a.score // 否则 选取当前分最高的（直接评分)
      }
      else {
        if (a.v.step !== b.v.step) return b.v.step - a.v.step
        else return b.score - a.score // 否则 选取当前分最高的（直接评分)
      }
    }
    else return (b.v.score - a.v.score)
  })
  var best = candidates[0];
  bestPoints = candidates.filter(function (p) {
    return math.greatOrEqualThan(p.v.score, best.v.score) && p.v.step === best.v.step
  });
  var result = candidates[0];
  result.score = candidates[0].v.score;
  result.step = candidates[0].v.step;
  config.log && console.log("可选节点：" + bestPoints.join(';'));
  config.log && console.log("选择节点：" + candidates[0] + ", 分数:"+result.score.toFixed(3)+", 步数:" + result.step);
  var time = (new Date() - start)/1000
  config.log && console.log('搜索节点数:'+ count+ ',AB剪枝次数:'+ABcut + ', PV剪枝次数:' + PVcut);
  config.log && console.log(',缓存命中:' + (cacheGet / cacheCount).toFixed(3) + ',' + cacheGet + '/' + cacheCount)
  config.log && console.log('算杀缓存:' + '总数 ' + debug.checkmate.cacheCount + ', 命中:' + (debug.checkmate.cacheHit / debug.checkmate.totalCount * 100).toFixed(3) + '% ,' + debug.checkmate.cacheHit + '/'+debug.checkmate.totalCount);
  //注意，减掉的节点数实际远远不止 ABcut 个，因为减掉的节点的子节点都没算进去。实际 4W个节点的时候，剪掉了大概 16W个节点
  config.log && console.log('当前统计：' + count + '个节点, 耗时:' + time.toFixed(2) + 's, NPS:' + Math.floor(count/ time) + 'N/S');
  config.log && console.log("================================");
  return result;
}
module.exports = deeping;
