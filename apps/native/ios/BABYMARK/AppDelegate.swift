import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = BrowserController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let home = URL(string: "https://babymark.pages.dev/")!
    private var web: WKWebView!
    private func trusted(_ url: URL?) -> Bool {
        guard let u = url else { return false }
        return u.scheme == "https" && u.host == "babymark.pages.dev" && (u.port == nil || u.port == 443) && u.user == nil && u.password == nil
    }
    private func maps(_ url: URL?) -> Bool {
        guard let u = url else { return false }
        return u.scheme == "https" && u.host == "www.google.com" && (u.port == nil || u.port == 443) && u.user == nil && u.password == nil && u.path.hasPrefix("/maps/")
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        web.load(URLRequest(url: home))
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if trusted(url) { decisionHandler(.allow); return }
        if navigationAction.targetFrame?.isMainFrame == true && navigationAction.navigationType == .linkActivated && trusted(webView.url) && maps(url), let url = url {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil && trusted(webView.url), let url = navigationAction.request.url, maps(url), navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
        }
        return nil
    }
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let safe = trusted(webView.url) && frame.isMainFrame && origin.protocol == "https" && origin.host == "babymark.pages.dev" && (origin.port == 0 || origin.port == 443) && type == .camera
        decisionHandler(safe ? .prompt : .deny)
    }
}
