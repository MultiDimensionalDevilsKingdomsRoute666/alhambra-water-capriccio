# 水之城 · Alhambra Water Capriccio

[![Deploy GitHub Pages](https://github.com/NilsonC-hub/alhambra-water-capriccio/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/NilsonC-hub/alhambra-water-capriccio/actions/workflows/deploy-pages.yml)

[在线体验](https://nilsonc-hub.github.io/alhambra-water-capriccio/)

一座受阿尔罕布拉启发的程序化建筑与水系随想。它不是测绘复原，也不是
CAD 模型；建筑、山地、庭院、渠道和园林均以 Three.js 几何模块组合，
重点是让水从山谷、分水节点、高位蓄水设施一路进入宫城的过程可以被看见。

## 运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

推送到 `main` 后，GitHub Actions 会自动构建并发布 GitHub Pages。

## 交互

- 拖拽场景：旋转建筑群
- 滚轮或触控板：缩放
- 拖动底部“水脉轨道”：任意回看水程
- “播放水程”：自动运行整套水系
- 点击水路、分水点、提水轮或庭院：聚焦对应设施
- 晨雾 / 日照 / 雨后：切换气候层
- 水声开关默认关闭

键盘可使用 `Space` 播放/暂停、`1–3` 切换气候、`Esc` 返回总览。

## 设计原则

- 保留 Capriccio 式程序化体块、排线、纸张色和版画轮廓；
- 建筑比例和地形经过构图压缩，不追求一比一；
- 水力逻辑采用节点—管线—分支—蓄水的图模型，不做 CFD；
- 青绿色水脉是画面中唯一持续运动的主动色；
- 当前版本不包含自由漫游、建造经济、行人或鸟群。

项目受到 [CAPRICCIO](https://github.com/emollick/capriccio) 的程序化方法与
视觉语言启发，相关说明见 `THIRD_PARTY_NOTICES.md`。
