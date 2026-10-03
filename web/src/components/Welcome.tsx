import { PROJECT } from '@irtc/protocol';
import { isHostedPage } from '../lib/connection';
import { useClient } from '../lib/gameStore';

/** "How to start" guide, shown while there is no run (first visit, hosted page...). */
export function Welcome() {
  const client = useClient();
  const companionOk = client.socket === 'open';
  const gameOk = client.state.connection.game === 'connected';
  const hosted = isHostedPage();
  const step = (done: boolean) => (done ? 'welcome__step welcome__step--done' : 'welcome__step');
  return (
    <section className="panel welcome" aria-label="Cómo empezar">
      <h2 className="panel__title">Cómo empezar</h2>
      <p className="welcome__lead">
        <strong>{PROJECT.name}</strong> muestra tu partida de The Binding of Isaac en tiempo real: stats, objetos al acercarte,
        inventario, sinergias, mapa e historial. Nada se dibuja dentro del juego.
      </p>
      <ol className="welcome__steps">
        <li className={step(gameOk)}>
          <strong>Suscríbete al mod</strong> en Steam Workshop
          {PROJECT.workshopUrl ? (
            <>
              {' '}
              (<a href={PROJECT.workshopUrl} target="_blank" rel="noreferrer">abrir en Steam</a>)
            </>
          ) : (
            <> (busca “{PROJECT.name}”)</>
          )}
          .
        </li>
        <li className={step(companionOk)}>
          <strong>Descarga y abre Isaac Chronicle Companion</strong> (
          <a href={PROJECT.releasesUrl} target="_blank" rel="noreferrer">
            IsaacCompanion-win-x64.zip
          </a>
          ). Es un único .exe: déjalo abierto mientras juegas.
          {companionOk ? <span className="welcome__ok"> ✓ detectado</span> : null}
        </li>
        <li className={step(gameOk)}>
          <strong>Inicia Isaac</strong> y empieza o continúa una partida.
          {gameOk ? <span className="welcome__ok"> ✓ conectado</span> : null}
        </li>
      </ol>
      {hosted && !companionOk ? (
        <p className="welcome__note">
          Esta página se conecta a la app en tu propio PC (<code>127.0.0.1:{PROJECT.companionPort}</code>); tus datos no salen de tu
          ordenador. Si el navegador pregunta por el acceso a la <em>red local</em>, permítelo. También puedes abrir directamente{' '}
          <a href={`http://127.0.0.1:${PROJECT.companionPort}`}>http://127.0.0.1:{PROJECT.companionPort}</a>.
        </p>
      ) : null}
      <p className="welcome__links small">
        <a href={PROJECT.repoUrl} target="_blank" rel="noreferrer">
          Código y documentación en GitHub
        </a>
      </p>
    </section>
  );
}
