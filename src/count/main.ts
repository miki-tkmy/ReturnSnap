import { StorageCapabilityChecker } from '../shared/storage/capability-check';
import { ReturnSnapCountApp } from './count-app';

window.addEventListener('DOMContentLoaded', async () => {
  const diagnosticMsgEl = document.getElementById('diagnosticMsg');
  const appContainerEl = document.getElementById('appContainer');

  try {
    const checker = new StorageCapabilityChecker();
    const capability = await checker.check();

    if (capability.supported) {
      // 診断合格: アプリケーション本体を起動
      if (diagnosticMsgEl) diagnosticMsgEl.style.display = 'none';
      if (appContainerEl) appContainerEl.style.display = 'block';
      
      const app = new ReturnSnapCountApp();
      await app.init();
    } else {
      // 診断不合格: 警告画面を表示して利用をブロック
      showBlockedMessage(capability.blockReason || '必要なストレージ機能がサポートされていません。');
    }
  } catch (err: any) {
    showBlockedMessage(err.message || '診断処理中に例外が発生しました。');
  }

  function showBlockedMessage(reason: string) {
    if (diagnosticMsgEl) {
      diagnosticMsgEl.style.display = 'block';
      diagnosticMsgEl.innerHTML = `
        <div style="background: #ffebee; color: #c62828; padding: 20px; border-radius: 8px; border: 1px solid #ef9a9a; margin: 20px; font-family: sans-serif; line-height: 1.6;">
          <h2 style="margin-top: 0; font-size: 18px;">⚠️ この端末では写真を安全に保存できません。</h2>
          <p style="margin: 10px 0; font-weight: bold; font-size: 15px;">理由: ${reason}</p>
          <hr style="border: none; border-top: 1px solid #ffcdd2; margin: 15px 0;">
          <ul style="padding-left: 20px; margin: 0; font-size: 13px; color: #555;">
            <li>ホーム画面に追加したReturnSnapから起動してください。</li>
            <li>Safari等のプライベートブラウズモードでは使用できません。</li>
            <li>端末の残りの空きストレージ容量が300MB以上あることを確認してください。</li>
            <li>問題が解決しない場合は管理者へ連絡してください。</li>
          </ul>
        </div>
      `;
    }
    if (appContainerEl) appContainerEl.style.display = 'none';
  }
});
