// WFLY Music — iOS Client (SwiftUI, single-file, cosmic UI)
// iOS 16+, Swift 5.9+. No 3rd‑party deps. Dark, animated starfield.
// ✅ Background audio (MPNowPlayingInfoCenter + MPRemoteCommandCenter)
// ✅ Remote controls (Control Center / Lock Screen)
// ✅ Auth (Register/Login for Users + Artists)
// ✅ Artist Profiles (banner, avatar, tracks, albums)
// ✅ Enhanced Search (text + genre filters)
// ✅ Home, Search, Library, Playlists
// ✅ AVPlayer streaming (HTTP Range) from /api/tracks/:id/stream
// ✅ WebSocket now_playing pings (wss:///ws)
// ✅ Keychain token storage, auto-refresh access token
//
// SETUP (Xcode > target):
// 1) Signing & Capabilities → + Capability → Background Modes → check "Audio, AirPlay, and Picture in Picture".
// 2) Info.plist → App Transport Security Settings → Allow Arbitrary Loads = NO (use proper HTTPS on device).
// 3) Replace base URLs in AppConfig with your server endpoints (HTTPS + WSS).
// 4) Run on iOS 16+.

import SwiftUI
import Combine
import AVFoundation
import Foundation
import MediaPlayer
import Security
import UIKit

// MARK: - Config

fileprivate enum AppConfig {
    // HTTP base for REST API (must be https on device unless ATS disabled)
    static let httpBase = URL(string: "https://flip.wfly.me:7412")! // ← change if needed
    // WebSocket path (we'll derive wss:// from httpBase host)
    static let wsPath = "/ws"
    static let appName = "WFLY Music"

    // Brand / UI
    static let accent = Color(hex: 0x7C3AED)
    static let accent2 = Color(hex: 0x3B82F6)
    static let cosmic1 = Color(hex: 0x0A0B1E)
    static let cosmic2 = Color(hex: 0x0F1123)
    static let cosmic3 = Color(hex: 0x13162E)
}

// MARK: - URL helpers

extension URL {
    /// Builds an absolute URL using `path` relative to this base (handles leading '/')
    func make(_ path: String) -> URL {
        URL(string: path, relativeTo: self)!.absoluteURL
    }
}

// MARK: - Models

struct APIUser: Codable, Identifiable { 
    let _id: String
    var id: String { _id }
    let email: String
    let displayName: String
    let role: String
}

struct Playlist: Codable, Identifiable {
    let _id: String
    var id: String { _id }
    let userId: String
    let name: String
    let slug: String
    let isSystem: Bool
    let createdAt: String?
    let tracks: [String]?
}

struct Track: Codable, Identifiable, Hashable {
    let _id: String
    var id: String { _id }
    let title: String
    let artistIds: [String]?
    let artistNames: [String]?
    let genres: [String]?
    let fileRel: String?
    let durationSec: Int?
    let plays: Int?
    let albumId: String?
}

struct Artist: Codable, Identifiable, Hashable {
    let _id: String
    var id: String { _id }
    let name: String
    let username: String?
    let about: String?
    let slug: String?
    let bannerUrl: String?
    let avatarUrl: String?
}

struct Album: Codable, Identifiable, Hashable {
    let _id: String
    var id: String { _id }
    let artistId: String
    let artistName: String?
    let title: String
    let releaseDate: String?
    let coverUrl: String?
    let tracks: [String]?
    let trackList: [Track]?
}

struct HomeSection: Codable, Identifiable {
    let id: String
    let title: String
    let items: [Track]
}

struct HomeResponse: Codable {
    let sections: [HomeSection]
}

struct SearchResponse: Codable {
    let tracks: [Track]
    let artists: [Artist]
    let albums: [Album]
}

struct MeResponse: Codable {
    let user: APIUser
    let playlists: [Playlist]
}

struct ArtistProfileResponse: Codable {
    let artist: Artist
    let tracks: [Track]
    let albums: [Album]
}

// MARK: - Keychain

enum Keychain {
    static func save(key: String, data: Data) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
    
    static func load(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue as Any,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var ref: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &ref)
        if status == errSecSuccess { return ref as? Data }
        return nil
    }
    
    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - Auth Store

struct AuthTokens: Codable {
    var accessToken: String
    var refreshToken: String
    var issuedAt: Date
    var expiresAt: Date
}

final class SessionStore: ObservableObject {
    @Published var user: APIUser? = nil
    @Published var artist: Artist? = nil
    @Published var tokens: AuthTokens? = nil
    @Published var playlists: [Playlist] = []
    @Published var isAuthenticated: Bool = false
    @Published var userType: String = "user" // "user" or "artist"

    private let keyTokens = "wfly.tokens"
    private let keyUserType = "wfly.userType"

    init() { loadFromKeychain() }

    func loadFromKeychain() {
        if let data = Keychain.load(key: keyTokens),
           let t = try? JSONDecoder().decode(AuthTokens.self, from: data) {
            self.tokens = t
        }
        if let data = Keychain.load(key: keyUserType),
           let type = String(data: data, encoding: .utf8) {
            self.userType = type
        }
    }
    
    func saveTokens(_ t: AuthTokens?, type: String = "user") {
        self.tokens = t
        self.userType = type
        if let t, let data = try? JSONEncoder().encode(t) {
            Keychain.save(key: keyTokens, data: data)
        } else {
            Keychain.delete(key: keyTokens)
        }
        if let typeData = type.data(using: .utf8) {
            Keychain.save(key: keyUserType, data: typeData)
        }
    }
    
    func logout() {
        user = nil
        artist = nil
        playlists = []
        saveTokens(nil)
        isAuthenticated = false
    }
}

// MARK: - API Client

actor APIClient {
    static let shared = APIClient()
    private init() {}
    private var tokens: AuthTokens? = nil
    
    func setTokens(_ t: AuthTokens?) { tokens = t }

    struct SimpleOK: Codable { let ok: Bool? }
    struct AnyEncodable: Encodable {
        private let encodeFunc: (Encoder) throws -> Void
        init<E: Encodable>(_ e: E) { encodeFunc = e.encode }
        func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
    }

    func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil, auth: Bool = false) async throws -> T {
        let url = AppConfig.httpBase.make(path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let tok = tokens?.accessToken {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 401, auth {
            try await refresh()
            return try await request(path, method: method, body: body, auth: auth)
        }
        guard 200..<300 ~= http.statusCode else {
            throw NSError(domain: "api", code: http.statusCode, userInfo: ["data": String(data: data, encoding: .utf8) ?? ""])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func refresh() async throws {
        guard let t = tokens else { throw URLError(.userAuthenticationRequired) }
        struct R: Codable { let accessToken: String }
        struct Body: Encodable { let refreshToken: String }
        let res: R = try await request("/api/auth/refresh", method: "POST", body: Body(refreshToken: t.refreshToken), auth: false)
        let now = Date()
        tokens = AuthTokens(accessToken: res.accessToken, refreshToken: t.refreshToken, issuedAt: now, expiresAt: now.addingTimeInterval(14*60))
    }

    // MARK: User Auth
    struct RegisterBody: Encodable {
        let email: String
        let password: String
        let displayName: String
        let device: DeviceInfo
    }
    struct LoginBody: Encodable {
        let email: String
        let password: String
        let device: DeviceInfo
    }
    struct AuthRes: Decodable {
        let accessToken: String
        let refreshToken: String
        let user: APIUser
    }

    func register(email: String, password: String, displayName: String, device: DeviceInfo) async throws -> AuthRes {
        try await request("/api/auth/register", method: "POST", body: RegisterBody(email: email, password: password, displayName: displayName, device: device), auth: false)
    }
    
    func login(email: String, password: String, device: DeviceInfo) async throws -> AuthRes {
        try await request("/api/auth/login", method: "POST", body: LoginBody(email: email, password: password, device: device), auth: false)
    }

    // MARK: Artist Auth
    struct ArtistRegisterBody: Encodable {
        let username: String
        let password: String
        let name: String
        let about: String?
    }
    struct ArtistLoginBody: Encodable {
        let username: String
        let password: String
    }
    struct ArtistAuthRes: Decodable {
        let accessToken: String
        let refreshToken: String
        let artist: Artist
    }

    func artistRegister(username: String, password: String, name: String, about: String?) async throws -> ArtistAuthRes {
        try await request("/api/artists/auth/register", method: "POST", body: ArtistRegisterBody(username: username, password: password, name: name, about: about), auth: false)
    }
    
    func artistLogin(username: String, password: String) async throws -> ArtistAuthRes {
        try await request("/api/artists/auth/login", method: "POST", body: ArtistLoginBody(username: username, password: password), auth: false)
    }

    func me() async throws -> MeResponse { try await request("/api/me", auth: true) }
    func home() async throws -> HomeResponse { try await request("/api/home", auth: false) }
    
    func search(q: String, genre: String? = nil, artistId: String? = nil) async throws -> SearchResponse {
        var queryItems: [URLQueryItem] = []
        if !q.isEmpty {
            queryItems.append(URLQueryItem(name: "q", value: q))
        }
        if let genre {
            queryItems.append(URLQueryItem(name: "genre", value: genre))
        }
        if let artistId {
            queryItems.append(URLQueryItem(name: "artistId", value: artistId))
        }
        var components = URLComponents(url: AppConfig.httpBase.make("/api/search"), resolvingAgainstBaseURL: true)!
        components.queryItems = queryItems
        let path = components.url!.path + "?" + (components.percentEncodedQuery ?? "")
        return try await request(path)
    }

    // Artist Profile
    func artistProfile(id: String) async throws -> ArtistProfileResponse {
        try await request("/api/artists/\(id)/profile", auth: false)
    }
    
    func myArtistProfile() async throws -> ArtistProfileResponse {
        try await request("/api/artists/me/profile", auth: true)
    }
    
    func updateArtistProfile(name: String?, about: String?, bannerUrl: String?, avatarUrl: String?) async throws -> Artist {
        struct Body: Encodable {
            let name: String?
            let about: String?
            let bannerUrl: String?
            let avatarUrl: String?
        }
        struct Res: Decodable { let artist: Artist }
        let res: Res = try await request("/api/artists/me/profile", method: "PUT", body: Body(name: name, about: about, bannerUrl: bannerUrl, avatarUrl: avatarUrl), auth: true)
        return res.artist
    }

    // Playlists
    struct CreatePlaylistBody: Encodable { let name: String }
    struct AddTrackBody: Encodable { let trackId: String }
    
    func fetchPlaylists() async throws -> [Playlist] {
        struct P: Decodable { let playlists: [Playlist] }
        let r: P = try await request("/api/playlists", auth: true)
        return r.playlists
    }
    
    func createPlaylist(name: String) async throws -> Playlist {
        try await request("/api/playlists", method: "POST", body: CreatePlaylistBody(name: name), auth: true)
    }
    
    func addTrack(to playlistId: String, trackId: String) async throws {
        let _: SimpleOK = try await request("/api/playlists/\(playlistId)/tracks", method: "POST", body: AddTrackBody(trackId: trackId), auth: true)
    }
    
    func removeTrack(from playlistId: String, trackId: String) async throws {
        let _: SimpleOK = try await request("/api/playlists/\(playlistId)/tracks/\(trackId)", method: "DELETE", auth: true)
    }

    nonisolated func streamURL(for trackId: String) -> URL {
        AppConfig.httpBase.make("/api/tracks/\(trackId)/stream")
    }
}

// MARK: - Device Info

struct DeviceInfo: Codable {
    let platform: String
    let os: String
    let model: String
    let appVersion: String
    let region: String
    
    static func current() -> DeviceInfo {
        let dev = UIDevice.current
        let os = dev.systemName + " " + dev.systemVersion
        let model = dev.model
        let region = Locale.current.region?.identifier ?? "US"
        let ver = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
        return .init(platform: "ios", os: os, model: model, appVersion: ver, region: region)
    }
}

// MARK: - WebSocket Client

final class WSClient: ObservableObject {
    @Published var connected = false
    private var task: URLSessionWebSocketTask?
    private var pingTimer: Timer?

    func connect(userId: String?) {
        disconnect()
        var comps = URLComponents()
        comps.scheme = "wss"
        comps.host = AppConfig.httpBase.host
        comps.port = AppConfig.httpBase.port
        comps.path = AppConfig.wsPath
        guard let wssURL = comps.url else { return }
        let task = URLSession.shared.webSocketTask(with: wssURL)
        self.task = task
        task.resume()
        listen()
        hello(userId: userId)
        startPings()
        connected = true
    }
    
    func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        connected = false
    }
    
    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                DispatchQueue.main.async { self.connected = false }
            case .success:
                break
            }
            self.listen()
        }
    }
    
    private func hello(userId: String?) {
        let hello: [String: Any] = ["type": "hello", "app": "ios", "uid": userId ?? NSNull()]
        if let data = try? JSONSerialization.data(withJSONObject: hello) {
            task?.send(.data(data)) { _ in }
        }
    }
    
    func sendNowPlaying(trackId: String, positionMs: Int) {
        let payload: [String: Any] = ["type": "now_playing", "trackId": trackId, "positionMs": positionMs]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            task?.send(.data(data)) { _ in }
        }
    }
    
    private func startPings() {
        pingTimer = Timer.scheduledTimer(withTimeInterval: 25, repeats: true) { [weak self] _ in
            self?.task?.send(.string("{\"type\":\"ping\"}")) { _ in }
        }
    }
}

// MARK: - Playback Manager (+ Remote)

final class PlaybackManager: ObservableObject {
    static let shared = PlaybackManager()

    @Published var current: Track? = nil
    @Published var isPlaying: Bool = false
    @Published var position: Double = 0 // seconds
    @Published var duration: Double = 0 // seconds

    private let player = AVPlayer()
    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    let ws = WSClient()

    private init() {
        configureAudioSession()
        configureRemoteCommands()
        observePlayerTime()
        observeInterruptions()
    }

    func attachSession(_ session: SessionStore) {
        session.isAuthenticated ? ws.connect(userId: session.user?.id ?? session.artist?.id) : ws.disconnect()
    }

    func play(track: Track) {
        let item = AVPlayerItem(url: APIClient.shared.streamURL(for: track.id))
        player.replaceCurrentItem(with: item)
        player.play()
        current = track
        isPlaying = true
        updateDurationFromItem()
        updateNowPlayingInfo(forceArtwork: true)
        haptic(.light)
    }

    func toggle() {
        isPlaying ? player.pause() : player.play()
        isPlaying.toggle()
        updateNowPlayingInfo()
    }
    
    func seek(to seconds: Double) {
        let t = CMTime(seconds: seconds, preferredTimescale: 600)
        player.seek(to: t) { [weak self] _ in
            self?.updateNowPlayingInfo()
        }
    }

    func next() { /* hook for queue: implement when you wire a queue */ haptic(.medium) }
    func prev() { /* hook for queue */ haptic(.medium) }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.allowAirPlay])
            try session.setActive(true)
        } catch {
            print("[Audio] session error: \(error)")
        }
    }

    private func configureRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.isEnabled = true
        cc.pauseCommand.isEnabled = true
        cc.togglePlayPauseCommand.isEnabled = true
        cc.nextTrackCommand.isEnabled = true
        cc.previousTrackCommand.isEnabled = true
        cc.changePlaybackPositionCommand.isEnabled = true

        cc.playCommand.addTarget { [weak self] _ in self?.ensurePlay(); return .success }
        cc.pauseCommand.addTarget { [weak self] _ in self?.ensurePause(); return .success }
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in self?.toggle(); return .success }
        cc.nextTrackCommand.addTarget { [weak self] _ in self?.next(); return .success }
        cc.previousTrackCommand.addTarget { [weak self] _ in self?.prev(); return .success }
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            if let e = event as? MPChangePlaybackPositionCommandEvent {
                self?.seek(to: e.positionTime)
            }
            return .success
        }
    }

    private func ensurePlay() {
        if !isPlaying {
            player.play()
            isPlaying = true
            updateNowPlayingInfo()
        }
    }
    
    private func ensurePause() {
        if isPlaying {
            player.pause()
            isPlaying = false
            updateNowPlayingInfo()
        }
    }

    private func observePlayerTime() {
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 1), queue: .main) { [weak self] t in
            guard let self else { return }
            position = t.seconds
            if let id = current?.id {
                ws.sendNowPlaying(trackId: id, positionMs: Int(t.seconds * 1000))
            }
            updateNowPlayingElapsed()
        }
    }

    private func updateDurationFromItem() {
        if let dur = player.currentItem?.asset.duration.seconds, dur.isFinite {
            duration = dur
        } else {
            duration = current?.durationSec.map(Double.init) ?? 0
        }
    }

    private func observeInterruptions() {
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let info = note.userInfo,
                  let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else { return }
            switch type {
            case .began:
                self?.isPlaying = false
            case .ended:
                if let optRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt,
                   AVAudioSession.InterruptionOptions(rawValue: optRaw).contains(.shouldResume) {
                    self?.player.play()
                    self?.isPlaying = true
                }
            @unknown default:
                break
            }
            self?.updateNowPlayingInfo()
        }
    }

    private func updateNowPlayingInfo(forceArtwork: Bool = false) {
        guard let t = current else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title,
            MPMediaItemPropertyArtist: (t.artistNames ?? []).joined(separator: ", "),
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        if forceArtwork || MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyArtwork] == nil {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: CGSize(width: 512, height: 512)) { _ in
                Self.placeholderArtwork(title: t.title)
            }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func updateNowPlayingElapsed() {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private static func placeholderArtwork(title: String) -> UIImage {
        let size = CGSize(width: 512, height: 512)
        let renderer = UIGraphicsImageRenderer(size: size)
        let img = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [UIColor(AppConfig.accent).cgColor, UIColor(AppConfig.accent2).cgColor] as CFArray,
                locations: [0, 1]
            )!
            ctx.cgContext.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 0), end: CGPoint(x: size.width, y: size.height), options: [])
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 40, weight: .bold),
                .foregroundColor: UIColor.white,
                .paragraphStyle: paragraph
            ]
            let s = NSString(string: title)
            s.draw(in: rect.insetBy(dx: 24, dy: 24), withAttributes: attrs)
        }
        return img
    }

    private func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}

// MARK: - App VM

final class AppVM: ObservableObject {
    @Published var home: [HomeSection] = []
    @Published var searchText: String = ""
    @Published var searchGenre: String? = nil
    @Published var searchResult: SearchResponse? = nil
    @Published var playlists: [Playlist] = []
    let session: SessionStore

    init(session: SessionStore) {
        self.session = session
    }

    func boot() {
        Task { [weak self] in
            guard let self else { return }
            await refreshMeIfPossible()
            await loadHome()
            await loadPlaylistsIfAuth()
        }
    }

    func refreshMeIfPossible() async {
        if session.tokens != nil {
            do {
                if session.userType == "artist" {
                    let profile = try await APIClient.shared.myArtistProfile()
                    await MainActor.run {
                        self.session.artist = profile.artist
                        self.session.isAuthenticated = true
                    }
                } else {
                    let me: MeResponse = try await APIClient.shared.me()
                    await MainActor.run {
                        self.session.user = me.user
                        self.session.playlists = me.playlists
                        self.session.isAuthenticated = true
                    }
                }
            } catch {
                await MainActor.run {
                    self.session.logout()
                }
            }
        }
    }

    func loadHome() async {
        do {
            let h = try await APIClient.shared.home()
            await MainActor.run {
                self.home = h.sections
            }
        } catch { }
    }

    func performSearch() async {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty || searchGenre != nil else {
            await MainActor.run {
                self.searchResult = nil
            }
            return
        }
        do {
            let s = try await APIClient.shared.search(q: q, genre: searchGenre)
            await MainActor.run {
                self.searchResult = s
            }
        } catch { }
    }

    func loadPlaylistsIfAuth() async {
        guard session.isAuthenticated, session.userType == "user" else { return }
        do {
            let lists = try await APIClient.shared.fetchPlaylists()
            await MainActor.run {
                self.playlists = lists
                self.session.playlists = lists
            }
        } catch { }
    }

    func createPlaylist(name: String) async {
        do {
            let p = try await APIClient.shared.createPlaylist(name: name)
            await MainActor.run {
                self.playlists.insert(p, at: 0)
            }
        } catch { }
    }

    func like(track: Track) async {
        _ = try? await APIClient.shared.request("/api/tracks/\(track.id)/like", method: "POST", auth: true) as APIClient.SimpleOK
    }
    
    func unlike(track: Track) async {
        _ = try? await APIClient.shared.request("/api/tracks/\(track.id)/like", method: "DELETE", auth: true) as APIClient.SimpleOK
    }
}

// MARK: - App Entry

@main
struct WFLYMusicApp: App {
    @StateObject var session = SessionStore()
    @StateObject var vm: AppVM
    @StateObject var playback = PlaybackManager.shared

    init() {
        let sess = SessionStore()
        _session = StateObject(wrappedValue: sess)
        _vm = StateObject(wrappedValue: AppVM(session: sess))
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                CosmicBackground()
                if session.isAuthenticated {
                    MainTabs()
                        .environmentObject(vm)
                        .environmentObject(session)
                        .environmentObject(playback)
                } else {
                    AuthView()
                        .environmentObject(session)
                }
            }
            .preferredColorScheme(.dark)
            .onAppear {
                Task {
                    await APIClient.shared.setTokens(session.tokens)
                }
                vm.boot()
                playback.attachSession(session)
            }
        }
    }
}

// MARK: - Cosmic Background (Starfield + nebula gradient)

struct CosmicBackground: View {
    var body: some View {
        ZStack {
            RadialGradient(
                colors: [AppConfig.cosmic1, AppConfig.cosmic2, AppConfig.cosmic3],
                center: .center,
                startRadius: 10,
                endRadius: 600
            )
            .ignoresSafeArea()
            NebulaVortex()
            Starfield(count: 140)
                .blendMode(.screen)
                .opacity(0.9)
        }
    }
}

struct NebulaVortex: View {
    @State private var animate = false
    var body: some View {
        AngularGradient(
            gradient: Gradient(colors: [
                AppConfig.accent.opacity(0.35),
                .clear,
                AppConfig.accent2.opacity(0.35),
                .clear
            ]),
            center: .center
        )
        .scaleEffect(1.8)
        .rotationEffect(.degrees(animate ? 360 : 0))
        .blur(radius: 40)
        .animation(.linear(duration: 120).repeatForever(autoreverses: false), value: animate)
        .onAppear { animate = true }
        .ignoresSafeArea()
    }
}

struct StarSeed {
    let x: CGFloat
    let y0: CGFloat
    let speed: CGFloat
    let size: CGFloat
    let twinkle: CGFloat
}

struct Starfield: View {
    let count: Int
    let seeds: [StarSeed]
    let start = Date()
    
    init(count: Int) {
        self.count = count
        self.seeds = (0..<count).map { _ in
            StarSeed(
                x: .random(in: 0...1),
                y0: .random(in: 0...1),
                speed: .random(in: 5...30),
                size: .random(in: 0.4...1.6),
                twinkle: .random(in: 0.3...1.0)
            )
        }
    }
    
    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let t = timeline.date.timeIntervalSince(start)
                for s in seeds {
                    let y = fmod((s.y0 * size.height) + CGFloat(t) * s.speed, size.height)
                    let x = s.x * size.width
                    let rect = CGRect(x: x, y: y, width: s.size, height: s.size)
                    var alpha = 0.6 + 0.4 * sin(CGFloat(t) * 2.0 * s.twinkle)
                    alpha = max(0.2, min(1.0, alpha))
                    ctx.opacity = alpha
                    ctx.fill(Path(ellipseIn: rect), with: .color(.white))
                }
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - Auth View (cosmic)

struct AuthView: View {
    enum Mode { case userLogin, userRegister, artistLogin, artistRegister }
    @EnvironmentObject var session: SessionStore
    @State private var mode: Mode = .userLogin
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var username = ""
    @State private var artistName = ""
    @State private var about = ""
    @State private var busy = false
    @State private var errorText: String? = nil

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 10) {
                    Text(AppConfig.appName)
                        .font(.system(size: 36, weight: .heavy))
                        .foregroundStyle(.white)
                    Text("cosmic edition")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.6))
                }
                .padding(.top, 40)

                Picker("", selection: $mode) {
                    Text("Вход").tag(Mode.userLogin)
                    Text("Регистрация").tag(Mode.userRegister)
                    Text("Артист Вход").tag(Mode.artistLogin)
                    Text("Артист Рег").tag(Mode.artistRegister)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                VStack(spacing: 14) {
                    if mode == .userLogin || mode == .userRegister {
                        capsuleField(icon: "envelope.fill", placeholder: "Email", text: $email, isSecure: false)
                        capsuleField(icon: "lock.fill", placeholder: "Пароль", text: $password, isSecure: true)
                        if mode == .userRegister {
                            capsuleField(icon: "person.crop.circle.fill", placeholder: "Отображаемое имя", text: $displayName, isSecure: false)
                        }
                    } else {
                        capsuleField(icon: "person.fill", placeholder: "Username", text: $username, isSecure: false)
                        capsuleField(icon: "lock.fill", placeholder: "Пароль", text: $password, isSecure: true)
                        if mode == .artistRegister {
                            capsuleField(icon: "music.mic", placeholder: "Имя артиста", text: $artistName, isSecure: false)
                            capsuleField(icon: "text.alignleft", placeholder: "О себе (опционально)", text: $about, isSecure: false)
                        }
                    }
                }
                .padding(.horizontal)

                if let err = errorText {
                    Text(err)
                        .foregroundStyle(.red)
                        .font(.footnote)
                }

                Button(action: submit) {
                    HStack {
                        Spacer()
                        if busy {
                            ProgressView()
                        } else {
                            Text(buttonTitle)
                                .bold()
                        }
                        Spacer()
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(AppConfig.accent)
                .clipShape(Capsule())
                .padding(.horizontal)
                .padding(.top, 6)
                
                Spacer(minLength: 40)
            }
            .padding(.bottom, 40)
        }
    }

    var buttonTitle: String {
        switch mode {
        case .userLogin: return "Войти"
        case .userRegister: return "Создать аккаунт"
        case .artistLogin: return "Войти как артист"
        case .artistRegister: return "Зарегистрировать артиста"
        }
    }

    @ViewBuilder
    private func capsuleField(icon: String, placeholder: String, text: Binding<String>, isSecure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(.white.opacity(0.8))
            if isSecure {
                SecureField(placeholder, text: text)
                    .textInputAutocapitalization(.never)
            } else {
                TextField(placeholder, text: text)
                    .textInputAutocapitalization(.never)
                    .keyboardType(mode == .userLogin || mode == .userRegister ? .emailAddress : .default)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }

    func submit() {
        Task { @MainActor in
            errorText = nil
            busy = true
            do {
                switch mode {
                case .userRegister:
                    let device = DeviceInfo.current()
                    let res = try await APIClient.shared.register(
                        email: email,
                        password: password,
                        displayName: displayName.isEmpty ? email : displayName,
                        device: device
                    )
                    let now = Date()
                    let tok = AuthTokens(
                        accessToken: res.accessToken,
                        refreshToken: res.refreshToken,
                        issuedAt: now,
                        expiresAt: now.addingTimeInterval(14*60)
                    )
                    session.saveTokens(tok, type: "user")
                    Task { await APIClient.shared.setTokens(tok) }
                    session.user = res.user
                    session.isAuthenticated = true
                    
                case .userLogin:
                    let device = DeviceInfo.current()
                    let res = try await APIClient.shared.login(email: email, password: password, device: device)
                    let now = Date()
                    let tok = AuthTokens(
                        accessToken: res.accessToken,
                        refreshToken: res.refreshToken,
                        issuedAt: now,
                        expiresAt: now.addingTimeInterval(14*60)
                    )
                    session.saveTokens(tok, type: "user")
                    Task { await APIClient.shared.setTokens(tok) }
                    session.user = res.user
                    session.isAuthenticated = true
                    
                case .artistRegister:
                    let res = try await APIClient.shared.artistRegister(
                        username: username,
                        password: password,
                        name: artistName,
                        about: about.isEmpty ? nil : about
                    )
                    let now = Date()
                    let tok = AuthTokens(
                        accessToken: res.accessToken,
                        refreshToken: res.refreshToken,
                        issuedAt: now,
                        expiresAt: now.addingTimeInterval(14*60)
                    )
                    session.saveTokens(tok, type: "artist")
                    Task { await APIClient.shared.setTokens(tok) }
                    session.artist = res.artist
                    session.isAuthenticated = true
                    
                case .artistLogin:
                    let res = try await APIClient.shared.artistLogin(username: username, password: password)
                    let now = Date()
                    let tok = AuthTokens(
                        accessToken: res.accessToken,
                        refreshToken: res.refreshToken,
                        issuedAt: now,
                        expiresAt: now.addingTimeInterval(14*60)
                    )
                    session.saveTokens(tok, type: "artist")
                    Task { await APIClient.shared.setTokens(tok) }
                    session.artist = res.artist
                    session.isAuthenticated = true
                }
            } catch {
                errorText = "Ошибка: \(error.localizedDescription)"
            }
            busy = false
        }
    }
}

// MARK: - Tabs + Mini Player (draggable)

struct MainTabs: View {
    @EnvironmentObject var vm: AppVM
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var playback: PlaybackManager
    @State private var showPlayer = false

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView {
                HomeView()
                    .tabItem { Label("Главная", systemImage: "house.fill") }
                SearchView()
                    .tabItem { Label("Поиск", systemImage: "magnifyingglass") }
                if session.userType == "user" {
                    LibraryView()
                        .tabItem { Label("Моя музыка", systemImage: "square.stack.fill") }
                } else {
                    ArtistDashboardView()
                        .tabItem { Label("Профиль", systemImage: "person.fill") }
                }
                ProfileView()
                    .tabItem { Label("Настройки", systemImage: "gearshape.fill") }
            }
            .tint(AppConfig.accent)

            if let t = playback.current {
                MiniPlayerBar(track: t, showPlayer: $showPlayer)
            }
        }
        .sheet(isPresented: $showPlayer) {
            PlayerFullView()
                .presentationDetents([.height(120), .medium, .large])
                .presentationBackground(.ultraThinMaterial)
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var vm: AppVM

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(vm.home) { section in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(section.title)
                                .font(.title3)
                                .bold()
                                .padding(.horizontal)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(section.items, id: \.id) { TrackCard(track: $0) }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }
                }
                .padding(.top)
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Главная").font(.headline)
                }
            }
            .task {
                await vm.loadHome()
            }
        }
    }
}

struct TrackCard: View {
    let track: Track
    @EnvironmentObject var playback: PlaybackManager
    @State private var pressed = false
    
    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                pressed = true
            }
            playback.play(track: track)
            DispatchQueue.main.asyncAfter(deadline: .now()+0.2) {
                pressed = false
            }
        }) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(LinearGradient(
                            colors: [AppConfig.accent.opacity(0.3), AppConfig.accent2.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 150, height: 150)
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08), lineWidth: 1))
                        .scaleEffect(pressed ? 0.96 : 1)
                        .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                    Image(systemName: "music.note.list")
                        .font(.system(size: 40))
                        .foregroundStyle(.white.opacity(0.9))
                }
                Text(track.title)
                    .font(.headline)
                    .lineLimit(1)
                Text((track.artistNames ?? []).joined(separator: ", "))
                    .foregroundStyle(.secondary)
                    .font(.caption)
                    .lineLimit(1)
            }
            .frame(width: 150)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Search

struct SearchView: View {
    @EnvironmentObject var vm: AppVM
    @State private var showGenreFilter = false
    
    let genres = ["", "hip-hop", "pop", "rock", "jazz", "electronic", "classical", "blues", "reggae", "country"]
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack {
                    TextField("Артисты, треки...", text: $vm.searchText)
                        .padding(12)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .submitLabel(.search)
                        .onSubmit {
                            Task { await vm.performSearch() }
                        }
                    
                    Button {
                        showGenreFilter = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .padding(10)
                    }
                    
                    Button {
                        Task { await vm.performSearch() }
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .padding(10)
                    }
                }
                .padding()
                
                // Genre filter chip
                if vm.searchGenre != nil {
                    HStack {
                        Text("Жанр: \(vm.searchGenre ?? "")")
                            .font(.caption)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(AppConfig.accent.opacity(0.3))
                            .clipShape(Capsule())
                        Button {
                            vm.searchGenre = nil
                            Task { await vm.performSearch() }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 8)
                }
                
                if let res = vm.searchResult {
                    List {
                        if !res.artists.isEmpty {
                            Section("Артисты") {
                                ForEach(res.artists) { artist in
                                    NavigationLink(destination: ArtistProfileView(artistId: artist.id)) {
                                        HStack {
                                            Image(systemName: "person.fill")
                                            Text(artist.name)
                                            Spacer()
                                        }
                                    }
                                }
                            }
                        }
                        if !res.albums.isEmpty {
                            Section("Альбомы") {
                                ForEach(res.albums) { album in
                                    NavigationLink(destination: AlbumDetailView(albumId: album.id)) {
                                        HStack {
                                            Image(systemName: "square.stack")
                                            VStack(alignment: .leading) {
                                                Text(album.title)
                                                Text(album.artistName ?? "")
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                            Spacer()
                                        }
                                    }
                                }
                            }
                        }
                        if !res.tracks.isEmpty {
                            Section("Треки") {
                                ForEach(res.tracks, id: \.id) { t in
                                    TrackRow(track: t)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                } else {
                    Spacer()
                    Text("Начните ввод для поиска")
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Поиск").font(.headline)
                }
            }
            .sheet(isPresented: $showGenreFilter) {
                NavigationStack {
                    List {
                        ForEach(genres, id: \.self) { genre in
                            Button {
                                vm.searchGenre = genre.isEmpty ? nil : genre
                                showGenreFilter = false
                                Task { await vm.performSearch() }
                            } label: {
                                HStack {
                                    Text(genre.isEmpty ? "Все жанры" : genre.capitalized)
                                    Spacer()
                                    if vm.searchGenre == genre || (vm.searchGenre == nil && genre.isEmpty) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(AppConfig.accent)
                                    }
                                }
                            }
                        }
                    }
                    .navigationTitle("Фильтр по жанру")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Готово") {
                                showGenreFilter = false
                            }
                        }
                    }
                }
            }
        }
    }
}

struct TrackRow: View {
    let track: Track
    @EnvironmentObject var playback: PlaybackManager
    
    var body: some View {
        Button(action: { playback.play(track: track) }) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(LinearGradient(
                            colors: [AppConfig.accent.opacity(0.25), AppConfig.accent2.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 44, height: 44)
                    Image(systemName: "music.note")
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading) {
                    Text(track.title)
                        .lineLimit(1)
                    Text((track.artistNames ?? []).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "play.fill")
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Artist Profile View

struct ArtistProfileView: View {
    let artistId: String
    @State private var profile: ArtistProfileResponse? = nil
    @State private var loading = true
    @EnvironmentObject var playback: PlaybackManager
    
    var body: some View {
        ScrollView {
            if let profile {
                VStack(spacing: 0) {
                    // Banner
                    ZStack(alignment: .bottomLeading) {
                        if let bannerUrl = profile.artist.bannerUrl, let url = URL(string: bannerUrl) {
                            AsyncImage(url: url) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Rectangle().fill(LinearGradient(
                                    colors: [AppConfig.accent.opacity(0.4), AppConfig.accent2.opacity(0.3)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                            }
                            .frame(height: 220)
                            .clipped()
                        } else {
                            Rectangle()
                                .fill(LinearGradient(
                                    colors: [AppConfig.accent.opacity(0.4), AppConfig.accent2.opacity(0.3)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(height: 220)
                        }
                        
                        // Avatar overlapping banner
                        HStack {
                            if let avatarUrl = profile.artist.avatarUrl, let url = URL(string: avatarUrl) {
                                AsyncImage(url: url) { image in
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Circle().fill(AppConfig.cosmic2)
                                }
                                .frame(width: 100, height: 100)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(.white, lineWidth: 4))
                                .shadow(radius: 10)
                                .offset(y: 50)
                            } else {
                                ZStack {
                                    Circle()
                                        .fill(LinearGradient(
                                            colors: [AppConfig.accent, AppConfig.accent2],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ))
                                        .frame(width: 100, height: 100)
                                        .overlay(Circle().stroke(.white, lineWidth: 4))
                                        .shadow(radius: 10)
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 40))
                                        .foregroundStyle(.white)
                                }
                                .offset(y: 50)
                            }
                            Spacer()
                        }
                        .padding(.leading, 20)
                    }
                    
                    // Artist info
                    VStack(alignment: .leading, spacing: 12) {
                        Text(profile.artist.name)
                            .font(.title)
                            .bold()
                            .padding(.top, 60)
                        
                        if let about = profile.artist.about, !about.isEmpty {
                            Text(about)
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .padding(.bottom, 8)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    
                    // Albums
                    if !profile.albums.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Альбомы")
                                .font(.title2)
                                .bold()
                                .padding(.horizontal, 20)
                                .padding(.top, 20)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(profile.albums) { album in
                                        NavigationLink(destination: AlbumDetailView(albumId: album.id)) {
                                            AlbumCard(album: album)
                                        }
                                    }
                                }
                                .padding(.horizontal, 20)
                            }
                        }
                    }
                    
                    // Tracks
                    if !profile.tracks.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Треки")
                                .font(.title2)
                                .bold()
                                .padding(.horizontal, 20)
                                .padding(.top, 20)
                            
                            ForEach(profile.tracks) { track in
                                TrackRow(track: track)
                                    .padding(.horizontal, 20)
                            }
                        }
                        .padding(.bottom, 100)
                    }
                }
            } else if loading {
                ProgressView()
                    .padding(.top, 100)
            } else {
                Text("Не удалось загрузить профиль")
                    .foregroundStyle(.secondary)
                    .padding(.top, 100)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadProfile()
        }
    }
    
    func loadProfile() async {
        do {
            let p = try await APIClient.shared.artistProfile(id: artistId)
            await MainActor.run {
                self.profile = p
                self.loading = false
            }
        } catch {
            await MainActor.run {
                self.loading = false
            }
        }
    }
}

struct AlbumCard: View {
    let album: Album
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(LinearGradient(
                        colors: [AppConfig.accent.opacity(0.3), AppConfig.accent2.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 140, height: 140)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08), lineWidth: 1))
                    .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
                Image(systemName: "square.stack.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white.opacity(0.9))
            }
            Text(album.title)
                .font(.subheadline)
                .bold()
                .lineLimit(1)
            if let date = album.releaseDate {
                Text(String(date.prefix(4)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 140)
    }
}

// MARK: - Album Detail View

struct AlbumDetailView: View {
    let albumId: String
    @State private var album: Album? = nil
    @State private var tracks: [Track] = []
    @State private var loading = true
    @EnvironmentObject var playback: PlaybackManager
    
    var body: some View {
        ScrollView {
            if let album {
                VStack(alignment: .leading, spacing: 16) {
                    // Album cover
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(LinearGradient(
                                colors: [AppConfig.accent.opacity(0.4), AppConfig.accent2.opacity(0.3)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                            .frame(width: 200, height: 200)
                            .shadow(radius: 15)
                        Image(systemName: "square.stack.3d.up.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    
                    VStack(alignment: .leading, spacing: 8) {
                        Text(album.title)
                            .font(.title)
                            .bold()
                        Text(album.artistName ?? "")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        if let date = album.releaseDate {
                            Text(date)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    Divider().padding(.horizontal, 20)
                    
                    // Tracks
                    if !tracks.isEmpty {
                        ForEach(tracks) { track in
                            TrackRow(track: track)
                                .padding(.horizontal, 20)
                        }
                    } else {
                        Text("Нет треков в альбоме")
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 100)
            } else if loading {
                ProgressView()
                    .padding(.top, 100)
            } else {
                Text("Не удалось загрузить альбом")
                    .foregroundStyle(.secondary)
                    .padding(.top, 100)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadAlbum()
        }
    }
    
    func loadAlbum() async {
        do {
            struct AlbumResponse: Codable {
                let album: Album
                let tracks: [Track]
            }
            let res: AlbumResponse = try await APIClient.shared.request("/api/albums/\(albumId)")
            await MainActor.run {
                self.album = res.album
                self.tracks = res.tracks
                self.loading = false
            }
        } catch {
            await MainActor.run {
                self.loading = false
            }
        }
    }
}

// MARK: - Library

struct LibraryView: View {
    @EnvironmentObject var vm: AppVM
    @EnvironmentObject var session: SessionStore
    @State private var showNew = false
    @State private var newName = ""
    
    var body: some View {
        NavigationStack {
            List {
                if let fav = session.playlists.first(where: { $0.slug == "favorites" }) {
                    Section("Избранное") {
                        NavigationLink(destination: PlaylistDetail(playlist: fav)) {
                            Text("Favorites")
                        }
                    }
                }
                Section("Ваши плейлисты") {
                    ForEach(vm.playlists) { p in
                        if p.slug != "favorites" {
                            NavigationLink(destination: PlaylistDetail(playlist: p)) {
                                Text(p.name)
                            }
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showNew = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("Библиотека").font(.headline)
                }
            }
            .task {
                await vm.loadPlaylistsIfAuth()
            }
            .alert("Новый плейлист", isPresented: $showNew) {
                TextField("Название", text: $newName)
                Button("Создать") {
                    Task {
                        await vm.createPlaylist(name: newName)
                        newName = ""
                    }
                }
                Button("Отмена", role: .cancel) {}
            } message: {
                Text("Введите имя плейлиста")
            }
        }
    }
}

struct PlaylistDetail: View {
    let playlist: Playlist
    
    var body: some View {
        VStack {
            Text(playlist.name)
                .font(.title2)
                .bold()
            Text("Треки появляются при добавлении из Поиска/Главной")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
        .navigationTitle(playlist.name)
    }
}

// MARK: - Artist Dashboard

struct ArtistDashboardView: View {
    @EnvironmentObject var session: SessionStore
    @State private var profile: ArtistProfileResponse? = nil
    @State private var loading = true
    @State private var showEditProfile = false
    
    var body: some View {
        NavigationStack {
            ScrollView {
                if let profile {
                    VStack(spacing: 0) {
                        // Banner (editable)
                        ZStack(alignment: .topTrailing) {
                            if let bannerUrl = profile.artist.bannerUrl, let url = URL(string: bannerUrl) {
                                AsyncImage(url: url) { image in
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Rectangle().fill(LinearGradient(
                                        colors: [AppConfig.accent.opacity(0.4), AppConfig.accent2.opacity(0.3)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ))
                                }
                                .frame(height: 200)
                                .clipped()
                            } else {
                                Rectangle()
                                    .fill(LinearGradient(
                                        colors: [AppConfig.accent.opacity(0.4), AppConfig.accent2.opacity(0.3)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ))
                                    .frame(height: 200)
                            }
                            
                            Button {
                                showEditProfile = true
                            } label: {
                                Image(systemName: "pencil.circle.fill")
                                    .font(.title)
                                    .foregroundStyle(.white)
                                    .shadow(radius: 5)
                            }
                            .padding()
                        }
                        
                        // Avatar
                        VStack(spacing: 16) {
                            if let avatarUrl = profile.artist.avatarUrl, let url = URL(string: avatarUrl) {
                                AsyncImage(url: url) { image in
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Circle().fill(AppConfig.cosmic2)
                                }
                                .frame(width: 100, height: 100)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(.white, lineWidth: 4))
                                .shadow(radius: 10)
                                .offset(y: -50)
                            } else {
                                ZStack {
                                    Circle()
                                        .fill(LinearGradient(
                                            colors: [AppConfig.accent, AppConfig.accent2],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ))
                                        .frame(width: 100, height: 100)
                                        .overlay(Circle().stroke(.white, lineWidth: 4))
                                        .shadow(radius: 10)
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 40))
                                        .foregroundStyle(.white)
                                }
                                .offset(y: -50)
                            }
                            
                            VStack(spacing: 8) {
                                Text(profile.artist.name)
                                    .font(.title2)
                                    .bold()
                                Text("@\(profile.artist.username ?? "")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .offset(y: -40)
                        }
                        
                        // Stats
                        HStack(spacing: 40) {
                            VStack {
                                Text("\(profile.tracks.count)")
                                    .font(.title)
                                    .bold()
                                Text("Треки")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            VStack {
                                Text("\(profile.albums.count)")
                                    .font(.title)
                                    .bold()
                                Text("Альбомы")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.bottom, 20)
                        
                        Divider()
                        
                        // Content sections
                        VStack(alignment: .leading, spacing: 20) {
                            if !profile.albums.isEmpty {
                                Text("Мои альбомы")
                                    .font(.title3)
                                    .bold()
                                    .padding(.horizontal, 20)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 12) {
                                        ForEach(profile.albums) { album in
                                            AlbumCard(album: album)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                }
                            }
                            
                            if !profile.tracks.isEmpty {
                                Text("Мои треки")
                                    .font(.title3)
                                    .bold()
                                    .padding(.horizontal, 20)
                                ForEach(profile.tracks) { track in
                                    TrackRow(track: track)
                                        .padding(.horizontal, 20)
                                }
                            }
                        }
                        .padding(.top, 20)
                        .padding(.bottom, 100)
                    }
                } else if loading {
                    ProgressView()
                        .padding(.top, 100)
                }
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Профиль артиста").font(.headline)
                }
            }
            .task {
                await loadProfile()
            }
            .sheet(isPresented: $showEditProfile) {
                EditArtistProfileView(profile: Binding(
                    get: { profile?.artist },
                    set: { _ in }
                )) {
                    Task { await loadProfile() }
                }
            }
        }
    }
    
    func loadProfile() async {
        do {
            let p = try await APIClient.shared.myArtistProfile()
            await MainActor.run {
                self.profile = p
                self.session.artist = p.artist
                self.loading = false
            }
        } catch {
            await MainActor.run {
                self.loading = false
            }
        }
    }
}

struct EditArtistProfileView: View {
    @Binding var profile: Artist?
    let onSave: () -> Void
    @Environment(\.dismiss) var dismiss
    @State private var name: String = ""
    @State private var about: String = ""
    @State private var bannerUrl: String = ""
    @State private var avatarUrl: String = ""
    @State private var busy = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Основная информация") {
                    TextField("Имя артиста", text: $name)
                    TextField("О себе", text: $about, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section("Изображения") {
                    TextField("URL баннера", text: $bannerUrl)
                    TextField("URL аватара", text: $avatarUrl)
                }
            }
            .navigationTitle("Редактировать профиль")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        Task {
                            await save()
                        }
                    }
                    .disabled(busy)
                }
            }
            .onAppear {
                if let p = profile {
                    name = p.name
                    about = p.about ?? ""
                    bannerUrl = p.bannerUrl ?? ""
                    avatarUrl = p.avatarUrl ?? ""
                }
            }
        }
    }
    
    func save() async {
        busy = true
        do {
            _ = try await APIClient.shared.updateArtistProfile(
                name: name.isEmpty ? nil : name,
                about: about.isEmpty ? nil : about,
                bannerUrl: bannerUrl.isEmpty ? nil : bannerUrl,
                avatarUrl: avatarUrl.isEmpty ? nil : avatarUrl
            )
            await MainActor.run {
                busy = false
                dismiss()
                onSave()
            }
        } catch {
            await MainActor.run {
                busy = false
            }
        }
    }
}

// MARK: - Profile / Settings

struct ProfileView: View {
    @EnvironmentObject var session: SessionStore
    
    var body: some View {
        NavigationStack {
            List {
                Section("Аккаунт") {
                    if let user = session.user {
                        HStack {
                            Text("Email")
                            Spacer()
                            Text(user.email)
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Имя")
                            Spacer()
                            Text(user.displayName)
                                .foregroundStyle(.secondary)
                        }
                    } else if let artist = session.artist {
                        HStack {
                            Text("Имя")
                            Spacer()
                            Text(artist.name)
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Username")
                            Spacer()
                            Text("@\(artist.username ?? "")")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
                Section {
                    Button(role: .destructive) {
                        session.logout()
                    } label: {
                        Text("Выйти")
                    }
                }
            }
            .navigationTitle("Настройки")
        }
    }
}

// MARK: - Mini Player Bar & Full Player

struct MiniPlayerBar: View {
    let track: Track
    @EnvironmentObject var playback: PlaybackManager
    @Binding var showPlayer: Bool
    @GestureState private var dragOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(LinearGradient(
                            colors: [AppConfig.accent.opacity(0.3), AppConfig.accent2.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 44, height: 44)
                    Image(systemName: "music.note")
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title)
                        .lineLimit(1)
                    Text((track.artistNames ?? []).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Button { playback.prev() } label: {
                    Image(systemName: "backward.fill")
                }
                Button { playback.toggle() } label: {
                    Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                }
                Button { playback.next() } label: {
                    Image(systemName: "forward.fill")
                }
            }
            .padding(10)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            ProgressView(value: min(max(playback.position / max(1, playback.duration), 0), 1))
                .progressViewStyle(.linear)
                .tint(AppConfig.accent)
                .padding([.leading, .trailing], 12)
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
        .shadow(radius: 3)
        .onTapGesture {
            showPlayer = true
        }
        .offset(y: dragOffset)
        .gesture(
            DragGesture(minimumDistance: 10, coordinateSpace: .local)
                .updating($dragOffset) { value, state, _ in
                    if value.translation.height < 0 {
                        state = value.translation.height
                    }
                }
                .onEnded { value in
                    if -value.translation.height > 60 {
                        showPlayer = true
                    }
                }
        )
    }
}

struct PlayerFullView: View {
    @EnvironmentObject var playback: PlaybackManager
    @State private var isScrubbing = false
    
    var body: some View {
        VStack(spacing: 16) {
            Capsule()
                .fill(.secondary)
                .frame(width: 40, height: 4)
                .padding(.top, 8)
            if let t = playback.current {
                Spacer(minLength: 10)
                ZStack {
                    RoundedRectangle(cornerRadius: 28)
                        .fill(LinearGradient(
                            colors: [AppConfig.accent.opacity(0.35), AppConfig.accent2.opacity(0.25)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 260, height: 260)
                        .overlay(RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(0.08), lineWidth: 1))
                        .shadow(color: .black.opacity(0.6), radius: 20, y: 12)
                    EqualizerBars()
                }
                VStack(spacing: 6) {
                    Text(t.title)
                        .font(.title2)
                        .bold()
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                    Text((t.artistNames ?? []).joined(separator: ", "))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                // Progress + slider
                VStack {
                    Slider(
                        value: Binding(
                            get: { playback.position },
                            set: { v in playback.position = v }
                        ),
                        in: 0...max(1, playback.duration),
                        onEditingChanged: { editing in
                            isScrubbing = editing
                            if !editing {
                                playback.seek(to: playback.position)
                            }
                        }
                    )
                    HStack {
                        Text(formatTime(playback.position))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(formatTime(playback.duration))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                HStack(spacing: 26) {
                    Button { playback.prev() } label: {
                        Image(systemName: "backward.end.fill")
                            .font(.title2)
                    }
                    Button { playback.toggle() } label: {
                        Image(systemName: playback.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 64))
                    }
                    Button { playback.next() } label: {
                        Image(systemName: "forward.end.fill")
                            .font(.title2)
                    }
                }
                .padding(.top, 6)
                Spacer()
            } else {
                Spacer()
                Text("Ничего не играет")
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(.bottom, 24)
        .background(LinearGradient(
            colors: [AppConfig.cosmic1.opacity(0.8), .black.opacity(0.2)],
            startPoint: .top,
            endPoint: .bottom
        ))
    }

    func formatTime(_ t: Double) -> String {
        guard t.isFinite else { return "0:00" }
        let m = Int(t) / 60
        let s = Int(t) % 60
        return "\(m):" + String(format: "%02d", s)
    }
}

struct EqualizerBars: View {
    @State private var values: [CGFloat] = (0..<5).map { _ in .random(in: 0.2...1.0) }
    
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(0..<5, id: \.self) { i in
                RoundedRectangle(cornerRadius: 3)
                    .fill(.white.opacity(0.9))
                    .frame(width: 10, height: 10 + 120 * values[i])
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                values = values.map { _ in .random(in: 0.2...1.0) }
            }
        }
    }
}

// MARK: - Misc Colors

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF)/255.0,
            green: Double((hex >> 8) & 0xFF)/255.0,
            blue: Double(hex & 0xFF)/255.0,
            opacity: alpha
        )
    }
}
