/**
 * OpenID Connect Authorization Request Parameters
 *
 * Represents the parameters that can be sent to the authorize endpoint in an OIDC flow.
 * Includes standard parameters from the OpenID Connect Core specification and common extensions.
 */

// Response type options
type ResponseType =
  | 'code' // Authorization Code Flow
  | 'token' // Implicit Flow (Access Token only)
  | 'id_token' // Implicit Flow (ID Token only)
  | 'id_token token' // Implicit Flow (both tokens)
  | 'code id_token' // Hybrid Flow
  | 'code token' // Hybrid Flow
  | 'code id_token token'; // Hybrid Flow

// Response mode options
type ResponseMode = 'query' | 'fragment' | 'form_post';

// Display options
type Display = 'page' | 'popup' | 'touch' | 'wap';

// Prompt options
type Prompt = 'none' | 'login' | 'consent' | 'select_account';

// Code challenge method options for PKCE
type CodeChallengeMethod = 'plain' | 'S256';

/**
 * OIDC Authorization Request Parameters
 * Represents all the parameters that can be sent to the authorize endpoint in an OpenID Connect flow.
 */
interface OIDCAuthorizationRequestParams {
  // Required parameters
  /**
   * Determines the grant type and flow to be used in the authorization process.
   * - 'code': Authorization Code Flow
   * - 'token': Implicit Flow (Access Token only)
   * - 'id_token': Implicit Flow (ID Token only)
   * - 'id_token token': Implicit Flow (both tokens)
   * - 'code id_token', 'code token', 'code id_token token': Hybrid Flows
   * @required
   */
  response_type: ResponseType;

  /**
   * The client identifier issued to the client during registration.
   * This uniquely identifies the application requesting authorization.
   * @required
   */
  client_id: string;

  /**
   * The URI to which the authorization server will redirect the user-agent
   * after authorization has been granted (or denied). Must match one of the
   * redirect URIs registered during client registration.
   * @required
   */
  redirect_uri: string;

  // Recommended parameters
  /**
   * Space-delimited list of scopes being requested.
   * For OpenID Connect flows, this SHOULD include 'openid'.
   * Common scopes include: 'profile', 'email', 'address', 'phone'.
   * @recommended
   * @example 'openid profile email'
   */
  scope?: string;

  /**
   * Opaque value used to maintain state between the request and callback.
   * Primarily used to prevent CSRF attacks by ensuring the authorization
   * response came from the same user who initiated the request.
   * @recommended
   */
  state?: string;

  // Common optional parameters
  /**
   * String value used to associate a client session with an ID Token.
   * Included in the ID Token to prevent replay attacks.
   * REQUIRED for Implicit and Hybrid flows.
   * @required for Implicit and Hybrid flows
   */
  nonce?: string;

  /**
   * Informs the authorization server about the mechanism to use
   * for returning parameters from the authorization endpoint.
   * - 'query': Parameters added to the redirect URI using the query component
   * - 'fragment': Parameters added to the redirect URI using the fragment component
   * - 'form_post': Parameters sent as the HTTP POST body
   */
  response_mode?: ResponseMode;

  /**
   * Specifies how the authentication user interface should be displayed.
   * - 'page': Default display for web-based clients
   * - 'popup': Optimized for popup windows
   * - 'touch': Optimized for touch devices
   * - 'wap': Optimized for mobile devices with limited capabilities
   */
  display?: Display;

  /**
   * Specifies the authorization server's desired authentication behavior.
   * Can be a space-delimited list of values.
   * - 'none': No UI displayed, return error if user is not already authenticated
   * - 'login': Force re-authentication even if user is already authenticated
   * - 'consent': Force consent screen to be displayed, even if consent was previously given
   * - 'select_account': Prompt user to select an account (useful for multi-account scenarios)
   */
  prompt?: Prompt | string;

  /**
   * Maximum elapsed time in seconds since the last authentication of the user.
   * If the elapsed time is greater, a new authentication is required.
   * @example 3600 // Re-authenticate if more than an hour has passed
   */
  max_age?: number;

  /**
   * End-user's preferred languages and scripts for the UI, ordered by preference.
   * Space-delimited list of BCP47 language tags.
   * @example 'fr-CA fr en'
   */
  ui_locales?: string;

  /**
   * Previously issued ID Token passed to the authorization server.
   * Used for requesting that the user be re-authenticated if the ID Token
   * is no longer valid.
   */
  id_token_hint?: string;

  /**
   * Hint to the Authorization Server about the login identifier the user
   * might use for authentication. Can be an email address, phone number,
   * or username, depending on the IDP's supported login methods.
   * @example 'user@example.com'
   */
  login_hint?: string;

  /**
   * Authentication Context Class Reference values, space-delimited.
   * Requested level of authentication assurance for the authentication event.
   * Higher values generally represent stronger authentication methods.
   * @example 'urn:mace:incommon:iap:silver'
   */
  acr_values?: string;

  // PKCE (RFC 7636) parameters
  /**
   * Proof Key for Code Exchange (PKCE) challenge.
   * Used to prevent authorization code interception attacks.
   * It's a Base64URL-encoded string derived from code_verifier.
   */
  code_challenge?: string;

  /**
   * Method used to derive the code challenge.
   * - 'plain': Direct use of the code_verifier
   * - 'S256': SHA-256 hash of the code_verifier
   * The more secure 'S256' method is recommended.
   */
  code_challenge_method?: CodeChallengeMethod;

  // Additional optional standard parameters

  /**
   * JWT encoded OpenID Request Object that contains a set of claims about
   * the authorization request. Allows for signed and/or encrypted request parameters.
   */
  request?: string;

  /**
   * URI that references a JWT-encoded OpenID Request Object.
   * The Request Object includes authorization request parameters.
   */
  request_uri?: string;

  /**
   * Allows for custom or implementation-specific parameters.
   * Different OpenID Connect providers may support additional parameters.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Example usage:
// const authorizationRequest: OIDCAuthorizationRequestParams = {
//   response_type: 'code',
//   client_id: 'client123',
//   redirect_uri: 'https://example.com/callback',
//   scope: 'openid profile email',
//   state: 'af0ifjsldkj',
//   nonce: 'n-0S6_WzA2Mj',
//   code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
//   code_challenge_method: 'S256',
//   custom_param: 'custom_value'  // Custom parameter example
// };

export type { CodeChallengeMethod, Display, OIDCAuthorizationRequestParams, Prompt, ResponseMode, ResponseType };
