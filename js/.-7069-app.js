document.addEventListener('DOMContentLoaded', () => {
  // Check if mpegts.js is available
  if (window.mpegts) {
    //console.log('mpegts.js loaded successfully');
  } else {
    console.error('mpegts.js not found - MPEG-TS playback may not work correctly');
  }
  
  let mpegtsPlayer = null;
  const videoElement = document.getElementById('videoElement');
  const statusMessage = document.getElementById('status-message');
  const streamUrlInput = document.getElementById('stream-url');

  // Error handling system
  const errorBanner = document.getElementById('stream-error-banner');
  const errorMessageEl = document.getElementById('error-message-text');
  const errorSuggestionsEl = document.getElementById('error-suggestions');
  const retryBtn = document.getElementById('retry-stream');
  const dismissBtn = document.getElementById('dismiss-error');
  
  // Track last attempted stream for retry functionality
  let lastAttemptedStream = null;
  let currentStreamType = null;
  let streamLoadTimeout = null;
  let streamHealthCheck = null;
  
  // Error categories and their corresponding messages/suggestions
  const errorCategories = {
    NETWORK_ERROR: {
      title: 'Network Connection Error',
      message: 'Unable to connect to the stream server. This could be due to network issues or server problems.',
      suggestions: [
        { icon: 'fa-wifi', text: 'Check your internet connection' },
        { icon: 'fa-server', text: 'The stream server might be temporarily unavailable' },
        { icon: 'fa-clock', text: 'Try again in a few minutes' },
        { icon: 'fa-external-link-alt', text: 'Try opening the stream in VLC or another media player' }
      ]
    },
    FORMAT_ERROR: {
      title: 'Stream Format Not Supported',
      message: 'Your browser doesn\'t support this stream format or the stream is corrupted.',
      suggestions: [
        { icon: 'fa-browser', text: 'Try using a different browser (Chrome, Firefox, Safari)' },
        { icon: 'fa-download', text: 'Try opening the stream in VLC Media Player' },
        { icon: 'fa-question-circle', text: 'Verify the stream URL is correct' },
        { icon: 'fa-tools', text: 'Check if the stream requires authentication' }
      ]
    },
    TIMEOUT_ERROR: {
      title: 'Stream Loading Timeout',
      message: 'The stream is taking too long to load. This might be due to slow connection or server issues.',
      suggestions: [
        { icon: 'fa-hourglass-half', text: 'Try increasing buffer size in settings' },
        { icon: 'fa-tachometer-alt', text: 'Check your internet speed' },
        { icon: 'fa-server', text: 'The stream server might be overloaded' },
        { icon: 'fa-sync-alt', text: 'Refresh the page and try again' }
      ]
    },
    CORS_ERROR: {
      title: 'Cross-Origin Request Blocked',
      message: 'The stream server doesn\'t allow direct browser access due to CORS restrictions.',
      suggestions: [
        { icon: 'fa-shield-alt', text: 'This is a security restriction from the stream provider' },
        { icon: 'fa-external-link-alt', text: 'Try opening the stream in VLC Media Player' },
        { icon: 'fa-mobile-alt', text: 'Use an IPTV app on your device instead' },
        { icon: 'fa-question-circle', text: 'Contact the stream provider for browser-compatible links' }
      ]
    },
    AUTH_ERROR: {
      title: 'Authentication Required',
      message: 'This stream requires authentication or the provided credentials are invalid.',
      suggestions: [
        { icon: 'fa-key', text: 'Check if the stream URL includes authentication parameters' },
        { icon: 'fa-user-lock', text: 'Verify your subscription or access permissions' },
        { icon: 'fa-clock', text: 'Authentication tokens may have expired' },
        { icon: 'fa-external-link-alt', text: 'Try opening in VLC with proper credentials' }
      ]
    },
    CODEC_ERROR: {
      title: 'Codec Not Supported',
      message: 'The stream uses audio/video codecs that your browser doesn\'t support.',
      suggestions: [
        { icon: 'fa-play-circle', text: 'Try a different browser or device' },
        { icon: 'fa-download', text: 'Use VLC Media Player for better codec support' },
        { icon: 'fa-tools', text: 'Check if browser extensions are blocking media' },
        { icon: 'fa-question-circle', text: 'Contact the stream provider about browser compatibility' }
      ]
    },
    GENERIC_ERROR: {
      title: 'Stream Playback Failed',
      message: 'An unexpected error occurred while trying to play the stream.',
      suggestions: [
        { icon: 'fa-sync-alt', text: 'Refresh the page and try again' },
        { icon: 'fa-browser', text: 'Try a different browser' },
        { icon: 'fa-external-link-alt', text: 'Try opening the stream in VLC Media Player' },
        { icon: 'fa-question-circle', text: 'Check if the stream URL is valid and accessible' }
      ]
    }
  };

  // Function to categorize errors
  function categorizeError(error, streamUrl, streamType) {
    console.log('Categorizing error:', error, 'for stream:', streamUrl, 'type:', streamType);
    
    // Network-related errors
    if (error.message && (
      error.message.includes('Network') ||
      error.message.includes('fetch') ||
      error.message.includes('NETWORK_ERROR') ||
      error.message.includes('ERR_NETWORK') ||
      error.message.includes('Failed to fetch')
    )) {
      return 'NETWORK_ERROR';
    }
    
    // CORS errors
    if (error.message && (
      error.message.includes('CORS') ||
      error.message.includes('cross-origin') ||
      error.message.includes('Access-Control')
    )) {
      return 'CORS_ERROR';
    }
    
    // Authentication errors
    if (error.message && (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Forbidden')
    )) {
      return 'AUTH_ERROR';
    }
    
    // Format/codec errors
    if (error.message && (
      error.message.includes('format') ||
      error.message.includes('codec') ||
      error.message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') ||
      error.message.includes('MEDIA_ERR_DECODE')
    )) {
      return streamType === 'video/mp2t' ? 'FORMAT_ERROR' : 'CODEC_ERROR';
    }
    
    // Timeout errors
    if (error.message && (
      error.message.includes('timeout') ||
      error.message.includes('TIMEOUT') ||
      error.message.includes('Loading timeout')
    )) {
      return 'TIMEOUT_ERROR';
    }
    
    // HTML5 video errors
    if (error.code !== undefined) {
      switch (error.code) {
        case 1: // MEDIA_ERR_ABORTED
          return 'GENERIC_ERROR';
        case 2: // MEDIA_ERR_NETWORK
          return 'NETWORK_ERROR';
        case 3: // MEDIA_ERR_DECODE
          return 'CODEC_ERROR';
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          return 'FORMAT_ERROR';
        default:
          return 'GENERIC_ERROR';
      }
    }
    
    return 'GENERIC_ERROR';
  }

  // Function to show error banner
  function showErrorBanner(errorType, streamUrl, additionalDetails = null) {
    const errorInfo = errorCategories[errorType] || errorCategories.GENERIC_ERROR;
    
    // Track error with Google Analytics
    if (window.gtag) {
      window.gtag('event', 'stream_error_displayed', {
        event_category: 'Stream',
        event_label: errorType,
        custom_map: {
          custom_parameter_1: errorInfo.title,
          custom_parameter_2: streamUrl
        }
      });
    }
    
    // Update banner content
    document.querySelector('.error-title').textContent = errorInfo.title;
    errorMessageEl.textContent = errorInfo.message;
    
    // Clear and populate suggestions
    errorSuggestionsEl.innerHTML = '';
    errorInfo.suggestions.forEach(suggestion => {
      const suggestionEl = document.createElement('div');
      suggestionEl.className = 'suggestion-item';
      suggestionEl.innerHTML = `
        <i class="fas ${suggestion.icon}"></i>
        <span>${suggestion.text}</span>
      `;
      errorSuggestionsEl.appendChild(suggestionEl);
    });
    
    // Show banner
    errorBanner.classList.remove('hidden');
    
    // Auto-hide after 30 seconds if not interacted with
    setTimeout(() => {
      if (!errorBanner.classList.contains('hidden')) {
        hideErrorBanner();
      }
    }, 30000);
  }

  // Function to hide error banner
  function hideErrorBanner() {
    errorBanner.classList.add('hidden');
  }

  // Function to handle stream loading with timeout
  function loadStreamWithTimeout(streamUrl, streamType, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Loading timeout - stream took too long to load'));
      }, timeoutMs);
      
      const cleanup = () => {
        clearTimeout(timeoutId);
      };
      
      // Set up success handlers
      const onCanPlay = () => {
        cleanup();
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        resolve();
      };
      
      const onError = (e) => {
        cleanup();
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.removeEventListener('error', onError);
        reject(videoElement.error || new Error('Video element error'));
      };
      
      videoElement.addEventListener('canplay', onCanPlay);
      videoElement.addEventListener('error', onError);
      
      // Store for cleanup
      streamLoadTimeout = timeoutId;
    });
  }

  // Enhanced error handler
  function handleStreamError(error, streamUrl, streamType) {
    console.error('Stream error:', error);
    
    // Clear any pending timeouts
    if (streamLoadTimeout) {
      clearTimeout(streamLoadTimeout);
      streamLoadTimeout = null;
    }
    
    // Update status message
    updateStatus('Stream failed to load', 'exclamation-triangle');
    
    // Categorize and show error
    const errorType = categorizeError(error, streamUrl, streamType);
    showErrorBanner(errorType, streamUrl, error.message);
    
    // Track error with Google Analytics
    if (window.gtag) {
      window.gtag('event', 'stream_error_handled', {
        event_category: 'Stream',
        event_label: errorType,
        custom_map: {
          custom_parameter_1: streamUrl,
          custom_parameter_2: streamType,
          custom_parameter_3: error.message || 'Unknown error'
        }
      });
    }
  }

  // Retry functionality
  retryBtn.addEventListener('click', () => {
    if (lastAttemptedStream) {
      hideErrorBanner();
      streamUrlInput.value = lastAttemptedStream;
      document.getElementById('load-stream').click();
    }
  });

  // Dismiss error banner
  dismissBtn.addEventListener('click', () => {
    hideErrorBanner();
  });

  // Parse URL parameters to get stream URL
  function getStreamUrlFromParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('url');
  }
  
  // Set stream URL from parameter if available
  const paramStreamUrl = getStreamUrlFromParams();
  if (paramStreamUrl) {
    // Decode the URL parameter (in case it's encoded)
    // Set the URL in the input field
    streamUrlInput.value = decodeURIComponent(paramStreamUrl);
    
    // Update status
    updateStatus('Stream URL detected, loading stream...', 'spinner fa-spin');
    
    // Automatically load the stream (trigger the load-stream button click)
    setTimeout(() => {
      document.getElementById('load-stream').click();
    }, 500); // Small delay to ensure DOM is ready
  }
  
  // Add function to update URL parameter when stream changes
  function updateUrlParameter(url) {
    if (!url) return;
    
    // Create new URL object based on current URL
    const newUrl = new URL(window.location.href);
    
    // Set or update the 'url' parameter
    newUrl.searchParams.set('url', encodeURIComponent(url));
    
    // Update browser history without reloading the page
    window.history.pushState({}, '', newUrl.toString());
  }

  // Theme toggle functionality
  const themeSwitch = document.getElementById('theme-switch');

  // Check for saved theme preference or use dark mode by default
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.body.className = savedTheme;
    themeSwitch.checked = savedTheme === 'dark-mode';
  } else {
    // Default to dark mode
    document.body.className = 'dark-mode';
    themeSwitch.checked = true;
    localStorage.setItem('theme', 'dark-mode');
  }
  
  // Handle theme switch
  themeSwitch.addEventListener('change', function() {
    const theme = this.checked ? 'dark-mode' : 'light-mode';
    document.body.className = theme;
    localStorage.setItem('theme', theme);
    
    // Track theme change with Google Analytics
    if (window.gtag) {
      window.gtag('event', 'theme_switched', {
        event_category: 'UI',
        event_label: theme
      });
    }
  });

  // Function to update status with icon
  function updateStatus(message, icon = 'info-circle') {
    statusMessage.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
  }
  
  // Handle stream loading
  document.getElementById('load-stream').addEventListener('click', () => {
    const streamUrl = streamUrlInput.value.trim();
    
    if (!streamUrl) {
      updateStatus('Please enter a stream URL', 'exclamation-circle');
      // Track error event
      if (window.gtag) {
        window.gtag('event', 'stream_load_error', {
          event_category: 'Stream',
          event_label: 'empty_url'
        });
      }
      return;
    }
    
    // Store the attempted stream for retry functionality
    lastAttemptedStream = streamUrl;
    
    // Hide any existing error banner
    hideErrorBanner();
    
    // Track stream loading start
    if (window.gtag) {
      window.gtag('event', 'stream_load_start', {
        event_category: 'Stream',
        event_label: 'load_attempt'
      });
    }
    
    // Update URL parameter when loading a stream
    updateUrlParameter(streamUrl);
    
    updateStatus('Loading stream...', 'spinner fa-spin');
    
    // Destroy previous player instance if exists
    if (mpegtsPlayer) {
      mpegtsPlayer.destroy();
      mpegtsPlayer = null;
    }
    
    // Destroy previous HLS player if exists
    if (window.hlsPlayer) {
      window.hlsPlayer.destroy();
      window.hlsPlayer = null;
    }
    
    // Clear any existing timeouts
    if (streamLoadTimeout) {
      clearTimeout(streamLoadTimeout);
      streamLoadTimeout = null;
    }
    
    // Set the video element to muted initially to allow autoplay
    videoElement.muted = true;
    
    // Automatically detect stream type based on URL extension
    const streamType = detectStreamType(streamUrl);
    currentStreamType = streamType;
    
    // Track stream type detection
    if (window.gtag) {
      window.gtag('event', 'stream_type_detected', {
        event_category: 'Stream',
        event_label: streamType
      });
    }
    
    // Set up timeout for stream loading
    const loadingTimeoutMs = 30000; // 30 seconds
    streamLoadTimeout = setTimeout(() => {
      const timeoutError = new Error('Loading timeout - stream took too long to load');
      handleStreamError(timeoutError, streamUrl, streamType);
    }, loadingTimeoutMs);
    
    try {
      // For MPEG-TS streams, use mpegts.js
      if (streamType === 'video/mp2t') {
        playMpegTsStream(streamUrl);
      } 
      // For HLS streams, use hls.js
      else if (streamType === 'application/x-mpegURL') {
        playHlsStream(streamUrl);
      } 
      // For MP4 streams, use enhanced MP4 player
      else if (streamType === 'video/mp4') {
        playMp4Stream(streamUrl);
      }
      // For other formats, use native video element
      else {
        playOtherFormats(streamUrl, streamType);
      }
    } catch (error) {
      console.error('Error during stream initialization:', error);
      handleStreamError(error, streamUrl, streamType);
    }
    
    // Add function to unmute after playback starts
    const attemptUnmute = () => {
      if (videoElement.paused) return;
      
      videoElement.muted = false;
      videoElement.removeEventListener('playing', attemptUnmute);
      videoElement.removeEventListener('timeupdate', attemptUnmute);
    };
    
    // Listen for playing event to unmute
    videoElement.addEventListener('playing', attemptUnmute);
    // Also listen for timeupdate as a fallback
    videoElement.addEventListener('timeupdate', attemptUnmute);
    
    // Ensure play overlay state is updated after stream load
    setTimeout(() => {
      updatePlayOverlay();
    }, 100);
    
    // Add enhanced video error tracking
    const onVideoError = (e) => {
      const error = videoElement.error || new Error('Video element error');
      handleStreamError(error, streamUrl, streamType);
    };
    
    const onVideoLoadStart = () => {
      if (streamLoadTimeout) {
        clearTimeout(streamLoadTimeout);
        streamLoadTimeout = null;
      }
      if (window.gtag) {
        window.gtag('event', 'video_loadstart', {
          event_category: 'Video',
          event_label: streamType
        });
      }
    };
    
    const onVideoCanPlay = () => {
      if (streamLoadTimeout) {
        clearTimeout(streamLoadTimeout);
        streamLoadTimeout = null;
      }
      if (window.gtag) {
        window.gtag('event', 'video_canplay', {
          event_category: 'Video',
          event_label: streamType
        });
      }
    };
    
    // Remove any existing error listeners
    videoElement.removeEventListener('error', onVideoError);
    videoElement.removeEventListener('loadstart', onVideoLoadStart);
    videoElement.removeEventListener('canplay', onVideoCanPlay);
    
    // Add new listeners
    videoElement.addEventListener('error', onVideoError);
    videoElement.addEventListener('loadstart', onVideoLoadStart);
    videoElement.addEventListener('canplay', onVideoCanPlay);
  });
  
  // Add settings handler
  document.getElementById('apply-settings').addEventListener('click', () => {
    const streamUrl = document.getElementById('stream-url').value.trim();
    
    if (!streamUrl) {
      statusMessage.textContent = 'Please enter a stream URL first';
      return;
    }
    
    // Get user settings
    const bufferSize = parseInt(document.getElementById('buffer-size').value) * 1024; // Convert to bytes
    const latencyMode = document.getElementById('latency-mode').value;
    const prebufferTime = parseInt(document.getElementById('prebuffer-time').value);
    
    // Track settings changes
    if (window.gtag) {
      window.gtag('event', 'settings_applied', {
        event_category: 'Settings',
        event_label: latencyMode,
        custom_map: {
          custom_parameter_1: bufferSize.toString(),
          custom_parameter_2: prebufferTime.toString()
        }
      });
    }
    
    // Apply latency settings based on mode
    let latencySettings = {};
    switch (latencyMode) {
      case 'low':
        latencySettings = {
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 2.0,
          liveBufferLatencyMinRemain: 0.5
        };
        break;
      case 'medium':
        latencySettings = {
          liveBufferLatencyChasing: false,
          liveBufferLatencyMaxLatency: 5.0,
          liveBufferLatencyMinRemain: 2.0
        };
        break;
      case 'high':
        latencySettings = {
          liveBufferLatencyChasing: false,
          liveBufferLatencyMaxLatency: 10.0,
          liveBufferLatencyMinRemain: 5.0
        };
        break;
    }
    
    // Store settings for next stream load
    window.playerSettings = {
      bufferSize: bufferSize,
      prebufferTime: prebufferTime,
      ...latencySettings
    };
    
    // Reload the stream with new settings
    document.getElementById('load-stream').click();
  });
  
  // Function to play MPEG-TS streams with mpegts.js
  function playMpegTsStream(url) {
    // Update status to show detected format
    updateStatus('Detected MPEG-TS stream format, initializing player...', 'spinner fa-spin');
    
    if (!window.mpegts || !mpegts.getFeatureList().mseLivePlayback) {
      const error = new Error('Your browser does not support MPEG-TS playback (Media Source Extensions not available)');
      handleStreamError(error, url, 'video/mp2t');
      return;
    }
    
    updateStatus('Initializing MPEG-TS player and pre-buffering...', 'spinner fa-spin');
    
    // Get custom settings or use defaults
    const settings = window.playerSettings || {};
    
    try {
      // Create mpegts.js player with much larger buffers
      mpegtsPlayer = mpegts.createPlayer({
        type: 'mpegts',
        isLive: true,
        url: url,
        // Add HTTP headers if needed for certain streams
        headers: {
          'Referer': document.location.href
        }
      }, {
        // MUCH larger buffer for smoother playback
        enableStashBuffer: true,
        stashInitialSize: settings.bufferSize || 4 * 1024 * 1024, // Default 4MB buffer
        
        // Significantly increase latency to reduce buffering
        liveBufferLatencyChasing: false, // Disable latency chasing
        liveBufferLatencyMaxLatency: 10.0, // Allow up to 10 seconds latency
        liveBufferLatencyMinRemain: 5.0, // Keep at least 5 seconds in buffer
        
        // Aggressive pre-buffering
        liveSync: false, // Don't try to sync with live edge
        
        // Network optimizations
        reuseRedirectedURL: true,
        loadingRetryDelay: 500, // Retry faster
        
        // Increase timeouts dramatically
        loadingTimeOut: 120000, // 2 minutes
        seekingTimeOut: 120000, // 2 minutes
        
        // Increase retry attempts
        maxLoadingRetry: 10,
        
        // Disable features that might cause stuttering
        fixAudioTimestampGap: false,
        accurateSeek: false,
        
        // Reduce CPU usage
        rangeLoadZeroStart: false,
        
        // Increase media source buffer size
        mediaSourceConfig: {
          isLive: true,
          autoCleanupSourceBuffer: false // Don't clean up buffer automatically
        }
      });
      
      // Attach to video element
      mpegtsPlayer.attachMediaElement(videoElement);
      
      // Pre-buffer before playing
      updateStatus('Pre-buffering stream (this may take a few seconds)...', 'hourglass fa-spin');
      
      // Load the stream
      mpegtsPlayer.load();
      
      // Handle events
      mpegtsPlayer.on(mpegts.Events.LOADING_COMPLETE, () => {
        updateStatus('Stream loaded successfully', 'check-circle');
      });
      
      mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, (mediaInfo) => {
        console.log('Media Info:', mediaInfo);
      });
      
      mpegtsPlayer.on(mpegts.Events.ERROR, (type, details) => {
        console.error('MPEGTS.js Error:', type, details);
        
        // Create a more descriptive error
        let errorMessage = `MPEG-TS Error: ${details}`;
        if (type === 'NetworkError') {
          errorMessage = `Network error loading MPEG-TS stream: ${details}`;
        } else if (type === 'MediaError') {
          errorMessage = `Media format error in MPEG-TS stream: ${details}`;
        }
        
        const error = new Error(errorMessage);
        handleStreamError(error, url, 'video/mp2t');
      });
      
      mpegtsPlayer.on(mpegts.Events.STATISTICS_INFO, (stats) => {
        //console.log('Buffer Health:', stats.playerType, stats.droppedFrames, stats.totalFrames);
        
        // Update status with buffer information
        if (stats.totalBytes > 0) {
          const bufferSizeMB = (stats.totalBytes / (1024 * 1024)).toFixed(2);
          updateStatus(`Playing: Buffer size ${bufferSizeMB}MB`, 'play-circle');
        }
      });
      
      // Wait for buffer before playing
      setTimeout(() => {
        // Start playback after pre-buffering
        mpegtsPlayer.play({ muted: true }).then(() => {
          updateStatus('Stream is playing', 'play-circle');
          
          // Add buffer monitoring
          startBufferMonitoring();
        }).catch(e => {
          console.error('Playback error:', e);
          
          // Check if this is an autoplay error
          if (e.name === 'NotAllowedError') {
            // Try again with muted (to bypass autoplay restrictions)
            mpegtsPlayer.play({ muted: true }).then(() => {
              updateStatus('Stream is playing (muted). Click volume icon to unmute.', 'play-circle');
              startBufferMonitoring();
            }).catch(err => {
              updateStatus('Stream loaded. <strong>Click the play button to start playback.</strong>', 'play-circle');
            });
          } else {
            // Handle other playback errors
            handleStreamError(e, url, 'video/mp2t');
          }
        });
      }, settings.prebufferTime || 5000); // Use custom pre-buffer time or default
      
    } catch (e) {
      console.error('MPEGTS player setup error:', e);
      handleStreamError(e, url, 'video/mp2t');
    }
  }
  
  // Monitor and optimize buffer
  function startBufferMonitoring() {
    if (!mpegtsPlayer) return;
    
    const bufferCheckInterval = setInterval(() => {
      if (!mpegtsPlayer) {
        clearInterval(bufferCheckInterval);
        return;
      }
      
      // Get video element buffer info
      const buffered = videoElement.buffered;
      if (buffered.length > 0) {
        const currentTime = videoElement.currentTime;
        const bufferEnd = buffered.end(buffered.length - 1);
        const bufferHealth = bufferEnd - currentTime;
        
        //console.log(`Buffer health: ${bufferHealth.toFixed(2)}s`);
        
        // If buffer is getting low, pause briefly to rebuild
        if (bufferHealth < 1.0) {
          if (!videoElement.paused) {
            //console.log("Buffer too low, pausing briefly to rebuild buffer");
            videoElement.pause();
            statusMessage.textContent = "Rebuilding buffer...";
            
            // Resume after allowing buffer to build
            setTimeout(() => {
              videoElement.play().catch(e => console.error("Error resuming:", e));
              statusMessage.textContent = "Resuming playback";
            }, 3000);
          }
        }
      }
    }, 1000); // Check more frequently
    
    // Clear interval when player is destroyed
    mpegtsPlayer.on(mpegts.Events.DESTROYED, () => {
      clearInterval(bufferCheckInterval);
    });
  }
  
  // Function to play other formats with native video element
  function playOtherFormats(url, type) {
    // Show detected format
    let formatName = "unknown";
    switch (type) {
      case 'application/x-mpegURL':
        formatName = "HLS";
        break;
      case 'video/mp4':
        formatName = "MP4";
        break;
      case 'video/webm':
        formatName = "WebM";
        break;
      case 'video/x-matroska':
        formatName = "MKV";
        break;
      case 'rtmp/mp4':
        formatName = "RTMP";
        break;
      default:
        formatName = type.split('/')[1].toUpperCase();
    }
    
    updateStatus(`Detected ${formatName} stream format, initializing player...`, 'spinner fa-spin');
    
    // Reset video element
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.removeAttribute('crossOrigin'); // Remove crossOrigin to avoid CORS issues
    videoElement.load();
    
    // Set new source
    videoElement.src = url;
    
    // Handle events
    videoElement.onerror = () => {
      console.error('Video error:', videoElement.error);
      statusMessage.textContent = `Error: ${videoElement.error?.message || 'Failed to load stream'}`;
      
      // Try with iframe as a last resort
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.allow = 'autoplay; fullscreen';
      iframe.src = url;
      
      const playerContainer = document.querySelector('.player-container');
      playerContainer.innerHTML = '';
      playerContainer.appendChild(iframe);
      
      statusMessage.textContent = 'Using alternative player for stream';
      
      // Add restore button
      const restoreButton = document.createElement('button');
      restoreButton.textContent = 'Restore Original Player';
      restoreButton.className = 'settings-btn';
      restoreButton.style.marginTop = '10px';
      restoreButton.onclick = () => {
        playerContainer.innerHTML = '';
        playerContainer.appendChild(videoElement);
        statusMessage.textContent = 'Original player restored';
      };
      
      if (!document.getElementById('restore-player-btn')) {
        restoreButton.id = 'restore-player-btn';
        document.querySelector('.player-controls').appendChild(restoreButton);
      }
    };
    
    videoElement.onloadeddata = () => {
      statusMessage.textContent = 'Stream loaded successfully';
    };
    
    videoElement.onplaying = () => {
      statusMessage.textContent = 'Stream is playing';
    };
    
    // Start playback
    videoElement.play().catch(e => {
      console.error('Playback error:', e);
      
      // Check if this is an autoplay error
      if (e.name === 'NotAllowedError') {
        // Try again with muted option (browsers allow muted autoplay)
        videoElement.muted = true;
        videoElement.play().then(() => {
          updateStatus('Stream is playing (muted). Click volume icon to unmute.', 'play-circle');
        }).catch(err => {
          statusMessage.textContent = `Playback error: ${e.message}`;
        });
      } else {
        statusMessage.textContent = `Playback error: ${e.message}`;
      }
    });
  }
  
  // Remove the VLC link handler
  // document.getElementById('vlc-link').addEventListener('click', () => {
  //   const streamUrl = document.getElementById('stream-url').value.trim();
  //   if (streamUrl) {
  //     // Create VLC link
  //     const vlcUrl = `vlc://${streamUrl}`;
  //     window.open(vlcUrl, '_blank');
  //     statusMessage.textContent = 'VLC link opened. Check your VLC player.';
  //   } else {
  //     statusMessage.textContent = 'Please enter a stream URL first';
  //   }
  // });
  
  // Add copy URL handler
  document.getElementById('copy-url').addEventListener('click', () => {
    const streamUrl = document.getElementById('stream-url').value.trim();
    if (streamUrl) {
      // Copy URL to clipboard
      navigator.clipboard.writeText(streamUrl).then(() => {
        statusMessage.textContent = 'Stream URL copied to clipboard';
      }).catch(err => {
        console.error('Failed to copy URL:', err);
        statusMessage.textContent = 'Failed to copy URL';
      });
    } else {
      statusMessage.textContent = 'Please enter a stream URL first';
    }
  });
  
  // Add direct URL input handling
  document.getElementById('stream-url').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('load-stream').click();
    }
  });
  
  // Function to detect stream type based on URL
  function detectStreamType(url) {
    url = url.toLowerCase();
    
    // Check for common extensions in the URL
    if (url.includes('.m3u8') || url.includes('application/x-mpegurl')) {
      return 'application/x-mpegURL';
    } else if (url.includes('.mp4') || url.includes('video/mp4')) {
      return 'video/mp4';
    } else if (url.includes('.ts') || url.includes('video/mp2t')) {
      return 'video/mp2t';
    } else if (url.includes('.webm') || url.includes('video/webm')) {
      return 'video/webm';
    } else if (url.includes('.mkv')) {
      return 'video/x-matroska';
    } else if (url.includes('.flv') || url.includes('video/x-flv')) {
      return 'video/x-flv';
    }
    
    // If no extension is found, try to detect based on URL patterns
    if (url.includes('rtmp://')) {
      return 'rtmp/mp4';
    }
    
    // For IPTV streams without clear extension, default to MPEG-TS
    // as it's the most common format for IPTV
    if (url.includes(':80/') || url.includes(':8080/') || 
        url.match(/:\d+\/\w+\/\w+\/\d+/)) {
      return 'video/mp2t';
    }
    
    // If we can't determine, default to MPEG-TS as it's common for IPTV
    return 'video/mp2t';
  }

  // Function to play HLS streams with hls.js
  function playHlsStream(url) {
    updateStatus('Detected HLS stream format, initializing player...', 'spinner fa-spin');
    
    // Reset video element
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    // Check if HLS.js is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        // HLS.js configuration
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        // Increase buffer size for smoother playback
        maxBufferSize: 30 * 1000 * 1000, // 30MB
        // Increase retry attempts
        maxLoadingRetry: 8,
        // Increase timeouts
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 20000,
        fragLoadingTimeOut: 120000
      });
      
      // Store the HLS player instance for later cleanup
      window.hlsPlayer = hls;
      
      // Bind HLS to video element
      hls.loadSource(url);
      hls.attachMedia(videoElement);
      
      // Handle HLS events
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        updateStatus('HLS manifest parsed, starting playback...', 'spinner fa-spin');
        
        // Pre-buffer before playing
        setTimeout(() => {
          videoElement.play().then(() => {
            updateStatus('Stream is playing', 'play-circle');
          }).catch(e => {
            console.error('Playback error:', e);
            
            // Check if this is an autoplay error
            if (e.name === 'NotAllowedError') {
              // Try again with muted option (browsers allow muted autoplay)
              videoElement.muted = true;
              videoElement.play().then(() => {
                updateStatus('Stream is playing (muted). Click volume icon to unmute.', 'play-circle');
              }).catch(err => {
                updateStatus('Stream loaded. <strong>Click the play button to start playback.</strong>', 'play-circle');
              });
            } else {
              updateStatus(`Playback error: ${e.message}`, 'exclamation-triangle');
            }
          });
        }, 3000); // Pre-buffer for 3 seconds
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover network error
              updateStatus('Network error, attempting to recover...', 'sync fa-spin');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Try to recover media error
              updateStatus('Media error, attempting to recover...', 'sync fa-spin');
              hls.recoverMediaError();
              break;
            default:
              // Cannot recover
              updateStatus(`Fatal error: ${data.details}`, 'exclamation-triangle');
              hls.destroy();
              break;
          }
        } else {
          console.warn('Non-fatal HLS error:', data);
        }
      });
      
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          const resolution = level.height;
          updateStatus(`Playing: ${resolution}p resolution`, 'play-circle');
        }
      });
      
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // For browsers that support HLS natively (Safari)
      videoElement.src = url;
      
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.play().then(() => {
          updateStatus('Stream is playing (native HLS)', 'play-circle');
        }).catch(e => {
          console.error('Playback error:', e);
          updateStatus(`Playback error: ${e.message}`, 'exclamation-triangle');
        });
      });
      
      videoElement.addEventListener('error', () => {
        console.error('Video error:', videoElement.error);
        updateStatus(`Error: ${videoElement.error?.message || 'Failed to load stream'}`, 'exclamation-triangle');
      });
      
    } else {
      updateStatus('Your browser does not support HLS playback', 'exclamation-triangle');
    }
  }

  // Function to play MP4 streams with enhanced support
  function playMp4Stream(url) {
    updateStatus('Detected MP4 stream format, initializing player...', 'spinner fa-spin');
    
    // Reset video element
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    // Add loading indicator to video container
    const playerContainer = document.querySelector('.player-container');
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = '<div class="spinner"><i class="fas fa-spinner fa-spin"></i></div>';
    playerContainer.appendChild(loadingOverlay);
    
    // For standard MP4 files, try direct playback without crossOrigin
    // This is important for sample videos that have CORS restrictions
    videoElement.removeAttribute('crossOrigin');
    videoElement.src = url;
    
    videoElement.onloadeddata = () => {
      // Remove loading overlay when video is ready
      if (loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
      updateStatus('MP4 stream loaded successfully', 'check-circle');
    };
    
    videoElement.onplaying = () => {
      updateStatus('MP4 stream is playing', 'play-circle');
    };
    
    videoElement.onerror = () => {
      console.error('Video error:', videoElement.error);
      
      // If direct playback fails, try with iframe as a fallback
      // This bypasses CORS restrictions for many sources
      tryWithIframe(url);
    };
    
    // Start playback
    videoElement.play().catch(e => {
      console.error('MP4 playback error:', e);
      
      // Check if this is an autoplay error
      if (e.name === 'NotAllowedError') {
        // Try again with muted option (browsers allow muted autoplay)
        videoElement.muted = true;
        videoElement.play().then(() => {
          updateStatus('Stream loaded (muted). Click volume icon to unmute.', 'play-circle');
        }).catch(err => {
          updateStatus('Stream loaded. <strong>Click the play button to start playback.</strong>', 'play-circle');
        });
      } else {
        // If play() fails for other reasons, try with iframe
        tryWithIframe(url);
      }
    });
    
    // Function to try with iframe (most compatible method)
    function tryWithIframe(videoUrl) {
      updateStatus('Trying alternative MP4 playback method...', 'sync fa-spin');
      
      // Create an iframe to bypass CORS restrictions
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.allow = 'autoplay; fullscreen';
      iframe.src = videoUrl;
      
      // Replace video element with iframe
      playerContainer.innerHTML = '';
      playerContainer.appendChild(iframe);
      
      // Remove loading overlay after a short delay
      setTimeout(() => {
        if (loadingOverlay.parentNode) {
          loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
        updateStatus('Using alternative player for MP4 stream', 'play-circle');
      }, 2000);
      
      // Add a button to restore the original player
      const restoreButton = document.createElement('button');
      restoreButton.textContent = 'Restore Original Player';
      restoreButton.className = 'settings-btn';
      restoreButton.style.marginTop = '10px';
      restoreButton.onclick = () => {
        playerContainer.innerHTML = '';
        playerContainer.appendChild(videoElement);
        updateStatus('Original player restored', 'info-circle');
        
        // Try again with original player but without crossOrigin
        videoElement.removeAttribute('crossOrigin');
        videoElement.src = videoUrl;
        videoElement.play().catch(e => console.error('Restore playback error:', e));
      };
      
      // Add restore button outside the player container
      const controlsContainer = document.querySelector('.player-controls');
      if (!document.getElementById('restore-player-btn')) {
        restoreButton.id = 'restore-player-btn';
        controlsContainer.appendChild(restoreButton);
      }
    }
  }

  // Add share link handler
  document.getElementById('share-link').addEventListener('click', () => {
    const streamUrl = document.getElementById('stream-url').value.trim();
    if (streamUrl) {
      // Create shareable URL with the stream URL as a parameter
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('url', encodeURIComponent(streamUrl));
      const shareableUrl = currentUrl.toString();
      
      // Try to use the Web Share API if available
      if (navigator.share) {
        navigator.share({
          title: 'IPTV Stream Player',
          text: 'Check out this IPTV stream',
          url: shareableUrl
        })
        .then(() => {
          updateStatus('Link shared successfully', 'check-circle');
        })
        .catch(error => {
          console.error('Error sharing:', error);
          // Fall back to clipboard copy
          copyToClipboard(shareableUrl);
        });
      } else {
        // Fall back to clipboard copy
        copyToClipboard(shareableUrl);
      }
    } else {
      updateStatus('Please enter a stream URL first', 'exclamation-circle');
    }
    
    // Helper function to copy to clipboard
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        updateStatus('Shareable link copied to clipboard', 'check-circle');
      }).catch(err => {
        console.error('Failed to copy URL:', err);
        updateStatus('Failed to copy shareable link', 'exclamation-triangle');
      });
    }
  });
  
  // Play overlay functionality - moved to be initialized early
  const playOverlay = document.getElementById('play-overlay');
  
  // Show/hide play overlay based on video state
  function updatePlayOverlay() {
    if (videoElement.paused || videoElement.ended) {
      playOverlay.classList.remove('hidden');
    } else {
      playOverlay.classList.add('hidden');
    }
  }
  
  // Function to initialize play overlay functionality
  function initializePlayOverlay() {
    // Handle play overlay click
    playOverlay.addEventListener('click', () => {
      // If video is paused/ended, resume playback
      if (videoElement.paused || videoElement.ended) {
        videoElement.play().catch(e => {
          console.error('Play overlay click error:', e);
          // Fallback to triggering load-stream button
          document.getElementById('load-stream').click();
        });
      } else {
        // If no stream is loaded, trigger the load-stream button
        document.getElementById('load-stream').click();
      }
    });
    
    // Listen for video state changes
    videoElement.addEventListener('play', updatePlayOverlay);
    videoElement.addEventListener('pause', updatePlayOverlay);
    videoElement.addEventListener('ended', updatePlayOverlay);
    videoElement.addEventListener('loadstart', updatePlayOverlay);
    videoElement.addEventListener('loadeddata', updatePlayOverlay);
    videoElement.addEventListener('canplay', updatePlayOverlay);
    
    // Initial state - show overlay by default
    updatePlayOverlay();
  }
  
  // Initialize play overlay functionality
  initializePlayOverlay();
  
  // Periodic check to ensure overlay state stays in sync (fallback)
  setInterval(() => {
    updatePlayOverlay();
  }, 1000);
});
