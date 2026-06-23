import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import crypto from "node:crypto";

export interface FixtureQrSiteServer {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

const html = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    ${body}
  </body>
</html>`;

const sendHtml = (response: ServerResponse, title: string, body: string): void => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html(title, body));
};

const redirect = (response: ServerResponse, location: string): void => {
  response.writeHead(302, {
    location,
    "set-cookie": "fixtureSession=1; Path=/; HttpOnly; SameSite=Lax"
  });
  response.end();
};

const createQrPath = (): string => `/qr?token=${crypto.randomUUID()}`;

const handleLogin = (
  request: IncomingMessage,
  requestUrl: URL,
  response: ServerResponse
): void => {
  if (request.method === "POST" || requestUrl.searchParams.get("login") === "1") {
    redirect(response, "/step-one");
    return;
  }

  const openerScript =
    requestUrl.searchParams.get("open") === "1"
      ? "<script>window.open('/dashboard', '_blank');</script>"
      : "";

  sendHtml(
    response,
    "Fixture Login",
    `<main data-route="login">
      <h1>Login</h1>
      <form action="/login" method="post">
        <label>Username <input autocomplete="username" data-testid="fixture-username" name="username" type="text"></label>
        <label>Password <input autocomplete="current-password" data-testid="fixture-password" name="password" type="password"></label>
        <button data-testid="fixture-login-submit" type="submit">Sign in</button>
      </form>
      <a href="/login?login=1">Sign in link</a>
      ${openerScript}
    </main>`
  );
};

const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  switch (requestUrl.pathname) {
    case "/":
      sendHtml(
        response,
        "Fixture Home",
        `<main data-route="home">
          <h1>Main</h1>
          <a data-testid="fixture-login-link" href="/login">Login</a>
        </main>`
      );
      return;
    case "/login":
      handleLogin(request, requestUrl, response);
      return;
    case "/dashboard":
      sendHtml(
        response,
        "Fixture Dashboard",
        '<main data-route="dashboard"><h1>Dashboard</h1><a data-testid="fixture-dashboard-qr-link" href="/qr">QR</a></main>'
      );
      return;
    case "/step-one":
      sendHtml(
        response,
        "Fixture Step One",
        `<main data-route="step-one">
          <h1>Step one</h1>
          <a data-testid="fixture-step-one-next" href="/step-two">Next</a>
        </main>`
      );
      return;
    case "/step-two":
      sendHtml(
        response,
        "Fixture Step Two",
        `<main data-route="step-two">
          <h1>Step two</h1>
          <a data-testid="fixture-step-two-qr" href="${createQrPath()}">QR</a>
        </main>`
      );
      return;
    case "/qr":
      sendHtml(
        response,
        "QR 코드",
        '<main data-route="qr"><h1>QR</h1><div id="qr-code">fixture-qr-code</div></main>'
      );
      return;
    default:
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8"
      });
      response.end("Not found");
  }
};

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }

      reject(error);
    });
  });

export const startFixtureQrSiteServer = async (port = 0): Promise<FixtureQrSiteServer> => {
  const server = http.createServer(handleRequest);

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Fixture QR server did not expose a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => closeServer(server)
  };
};
