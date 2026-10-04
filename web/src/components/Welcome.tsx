import { PROJECT } from '@irtc/protocol';
import { isHostedPage } from '../lib/connection';
import { useClient } from '../lib/gameStore';
import { useT } from '../lib/strings';

/** "Getting started" guide, shown while there is no run (first visit, hosted page...). */
export function Welcome() {
  const client = useClient();
  const t = useT();
  const companionOk = client.socket === 'open';
  const gameOk = client.state.connection.game === 'connected';
  const hosted = isHostedPage();
  const step = (done: boolean) => (done ? 'welcome__step welcome__step--done' : 'welcome__step');
  const addr = `127.0.0.1:${PROJECT.companionPort}`;
  return (
    <section className="panel welcome" aria-label={t('welcome.title')}>
      <h2 className="panel__title">{t('welcome.title')}</h2>
      <p className="welcome__lead">{t('welcome.lead', { name: PROJECT.name })}</p>
      <ol className="welcome__steps">
        <li className={step(gameOk)}>
          <strong>{t('welcome.step1')}</strong> {t('welcome.step1b')} (
          {PROJECT.workshopUrl ? (
            <a href={PROJECT.workshopUrl} target="_blank" rel="noreferrer">
              {t('welcome.openSteam')}
            </a>
          ) : (
            t('welcome.search', { name: PROJECT.name })
          )}
          ).
        </li>
        <li className={step(companionOk)}>
          <strong>{t('welcome.step2')}</strong> (
          <a href={PROJECT.releasesUrl} target="_blank" rel="noreferrer">
            IsaacCompanion-win-x64.zip
          </a>
          ). {t('welcome.step2b')}
          {companionOk ? <span className="welcome__ok"> {t('welcome.detected')}</span> : null}
        </li>
        <li className={step(gameOk)}>
          <strong>{t('welcome.step3')}</strong> {t('welcome.step3b')}
          {gameOk ? <span className="welcome__ok"> {t('welcome.connected')}</span> : null}
        </li>
      </ol>
      <p className="welcome__note">{t('welcome.lang')}</p>
      {hosted && !companionOk ? (
        <p className="welcome__note">
          {t('welcome.note', { addr })} <a href={`http://${addr}`}>http://{addr}</a>.
        </p>
      ) : null}
      <p className="welcome__links small">
        <a href={PROJECT.repoUrl} target="_blank" rel="noreferrer">
          {t('welcome.code')}
        </a>
      </p>
      <p className="welcome__support small">
        {t('support.text')}{' '}
        <a href={PROJECT.kofiUrl} target="_blank" rel="noreferrer">
          ☕ Ko-fi
        </a>{' '}
        ·{' '}
        <a href={PROJECT.sponsorsUrl} target="_blank" rel="noreferrer">
          ♥ GitHub Sponsors
        </a>
      </p>
    </section>
  );
}
