import { InfoModal } from './InfoModal'

export function CardHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoModal title="発展カード説明" onClose={onClose}>
      <p className="info-modal__note">
        発展カードは購入した同じ手番には使用できません。1手番に使用できる発展カードは1枚までです（勝利点カードは対象外）。
      </p>

      <section>
        <h3>⚔ 騎士</h3>
        <p>盗賊コマを移動し、隣接する相手から1枚奪います（7が出た時と同じ処理）。使用した枚数が3枚以上でトップなら「最大騎士力」（2点）を獲得します。</p>
      </section>

      <section>
        <h3>🛣 街道建設</h3>
        <p>資源を消費せずに道路を2本まとめて建設できます。</p>
      </section>

      <section>
        <h3>🎁 発明</h3>
        <p>好きな資源を合計2枚、銀行から受け取ります（同じ資源2枚でも、異なる資源1枚ずつでも可）。</p>
      </section>

      <section>
        <h3>💰 独占</h3>
        <p>指定した種類の資源を、他の全プレイヤーの手札から根こそぎ回収します。</p>
      </section>

      <section>
        <h3>🏆 勝利点</h3>
        <p>使用する必要はなく、持っているだけで1点になります（他プレイヤーには公開されません）。</p>
      </section>
    </InfoModal>
  )
}
