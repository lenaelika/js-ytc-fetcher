/**
 * Запрашивает данные о видео и комментарии через Youtube Data API v3.
 */
"use strict";

var params, timer = null;

var srcRegex = {
    "channel": new RegExp("^[a-z0-9_-]{24}$", "i"),
    "video": new RegExp("^[a-z0-9_-]{11}$", "i"),
};

$(function() {
    window.onerror = showError;

    // restore previous form params
    var $form = $("#request-form");
    try {
        params = JSON.parse(localStorage.getItem("requestParams"));
    } catch (e) {}

    if (typeof params !== "object" || params === null) {
        params = {};
    }

    // get params override locals
    var get = {};
    window.location.search.replace(/[?&]+(\w+)=([^?&#]*)/g, (str, key, value) => {
        get[key] = value.trim();
    });
    
    // fetch data if all get params as provided
    var fetch = true;
    $form.find("input").each((i, item) => {
        if (item.name in get) {
            params[item.name] = get[item.name];
        } else {
            fetch = false;
        }
        if (item.name in params) {
            item.value = params[item.name];
        }
    });
    storeParams();

    // event handlers
    $("#request-from").submit(validateForm);
    $("#stop").click(stop);
    $("#renew").click(renew);
    $("#refresh").click(loadVideo);

    fetch ? loadClient() : showRequestForm();
});

/**
 * Сохраняет параметры запроса в локальном хранилище браузера.
 */
function storeParams() {
    localStorage.setItem("requestParams", JSON.stringify(params));
}

/**
 * Показывает первоначальную форму запроса.
 */
function showRequestForm() {
    $("#request-form").removeClass("was-validated");
    $("#request").removeClass("d-none");
}

/**
 * Валидирует форму перед запуском получения комментариев.
 * @param {event}
 * @returns bool
 */
function validateForm(e) {
    var $form = $("#request-form").addClass("was-validated");
    var valid = $form.get(0).checkValidity();
    if (!valid) {
        e.preventDefault();
        e.stopPropagation();
    }
    return valid;
}

/**
 * Сбрасывает форму и get-параметры к значениям по умолчанию.
 */
function renew() {
    params = {
        "key": params.key || "",
    }
    storeParams();
    window.location.href = "./index.html";
}

/**
 * Останавливает обновление комментариев и показывает форму запроса.
 */
function stop() {
    if (timer !== null) {
        clearInterval(timer);
    }
    $(this).addClass("d-none");
    $("#update").addClass("d-none");
    showRequestForm();
}

/**
 * Инициализирует клиент взаимодействия с Google API.
 */
function loadClient() {

    gapi.load("client", {
        callback: () => {
            gapi.client.init({
                "apiKey": params.key,
                "discoveryDocs": ["https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest"],
            }).then(
                () => {
                    // guess source
                    if (srcRegex["channel"].test(params.id)) {
                        params.channelId = params.id;
                        params.username = null;
                        loadChannelVideo();
                    } else if (srcRegex["video"].test(params.id)) {
                        params.videoId = params.id;
                        loadVideo();
                    } else {
                        params.channelId = null;
                        params.username = params.id;
                        loadChannelVideo();
                    }
                }
            );
        },
        onerror: (err) => {
            showError("Failed to load client", err);
        },
    });
}

/**
 * Загружает последнее видео по идентификатору или имени канала.
 */
function loadChannelVideo() {
    
    // get playlist of channel uploads
    gapi.client.youtube.channels.list({
        "part": "contentDetails",
        "id": params.channelId,
        "forUsername": params.username,
    }).then(
        (resp) => {
            if (resp.result.items.length < 1) {
                showWarning("Channel not found");
                return;
            }

            var playlistId = resp.result.items[0].contentDetails.relatedPlaylists.uploads;
            if (!playlistId) {
                showWarning("Channel uploads not found");
                return
            }

            gapi.client.youtube.playlistItems.list({
                "part": "contentDetails",
                "playlistId": playlistId,
                "maxResults": 1,
            }).then(
                (resp) => {
                    if (resp.result.items.length < 1) {
                        showWarning("Uploads list is empty");
                        return;
                    }

                    params.videoId = resp.result.items[0].contentDetails.videoId;
                    loadVideo();
                },
                (err) => {
                    showError("Failed to load uploads list", err);
                }
            );
        },
        (err) => {
            showError("Failed to load channel info", err);
        }
    ).then(

    );
}

/**
 * Загружает данные о видео.
 */
function loadVideo() {

    gapi.client.youtube.videos.list({
        "part": "snippet,statistics",
        "id": params.videoId,
    }).then(
        (resp) => {
            if (resp.result.items.length < 1) {
                showWarning("Video not found");
                return;
            }

            $("#request").addClass("d-none");

            var video = resp.result.items[0];
            var href = "https://www.youtube.com/watch?v=" + video.id;
            $("#videoTitle").html("<a href='" + href + "' target='_blank'>" + video.snippet.title + "</a>");

            $("#videoStats").text(
                formatDate(video.snippet.publishedAt)[0] + ' '
                + video.statistics.viewCount + ' views, '
                + video.statistics.likeCount + ' likes, '
                + video.statistics.commentCount + ' comments'
            );
            $("#list").removeClass("d-none");

            params.channelId = video.snippet.channelId;
            storeParams();

            loadComments();
        },
        (err) => {
            showError("Failed to load video info", err);
        }
    );

    return false;
}

/**
 * Загружает комментарии с автообновлением.
 */
function loadComments() {

    gapi.client.youtube.commentThreads.list({
        "part": "snippet",
        "videoId": params.videoId,
        "maxResults": params.limit || 20,
    }).then(
        (resp) => {
            if (resp.result.items.length < 1) {
                showWarning("Comments not found");
                return;
            }

            var $list = $("<div id='comments'>");
            resp.result.items.forEach((item) => {
                $list.append(makeComment(
                    item.id,
                    item.snippet.topLevelComment.snippet,
                    item.snippet.totalReplyCount
                ));
            });
            // @todo promises to wait for replies to load
            setTimeout(() => {
                $("#comments").replaceWith($list);

                // autoupdate
                var $update = $("#update");
                var $refresh = $("#refresh");
                var $stop = $("#stop");
                var t = params.update || 0;
                if (t < 1) {
                    $update.addClass("d-none");
                    $refresh.removeClass("d-none");
                    $stop.text("edit request").removeClass("d-none");
                } else {
                    $refresh.addClass("d-none");

                    var $counter = $update.find("span").text(t);
                    timer = setInterval(() => {
                        $counter.text(t--);
                        if (t === 0) {
                            clearInterval(timer);
                            timer = null;
                            loadComments();
                        }
                    }, 1000);

                    $stop.text("stop & edit request").removeClass("d-none");
                    $update.removeClass("d-none");
                }
            }, 500);
        },
        (err) => {
            showError("Failed to load comments", err);
        }
    );
}

/**
 * Формирует элемент-комментарий.
 * Подгружает ответы на авторские комментарии.
 * 
 * @param {object} comment Объект комментария
 * @param {int} replyCount Кол-во ответов
 * @returns {object} DOM-комментарий
 */
function makeComment(commentId, comment, replyCount) {
    var isAuthor = comment.authorChannelId !== undefined
        && comment.authorChannelId.value === params.channelId;

    var $c = $("#comment-template > div").clone();
    var $username = $c.find(".comment-username").text(comment.authorDisplayName);
    if (isAuthor) {
        $username.addClass("text-danger");
    }

    var dt = formatDate(comment.publishedAt);
    $c.find(".comment-date").text(dt[0]);

    var $text = $c.find(".comment-text");
    $text.html(comment.textDisplay);
    // выделим текст новых комментариев
    if (dt[1]) {
        $text.addClass("text-success");
    }

    // подгрузим ответы и выделим коммент автора
    var $replyCount = $c.find(".comment-reply-count");
    if (replyCount > 0) {
        $replyCount.find("a").attr("href", "#r-" + commentId).text(replyCount);
        loadReplies(commentId, $c);

        if (isAuthor) {
            var $card = $("#comment-card-template > div").clone();
            $card.find("div").append($c.removeClass());
            return $card;
        }
    } else {
        $replyCount.remove();
    }

    return $c;
}

/**
 * Задает формат отображения даты.
 * @param {string} str Дата в формате ISO 
 * @returns {array} Лейбл даты; Флаг "свежести"
 */
function formatDate(str) {

    var dt = new Date(str);
    var diff = (Date.now() - dt.getTime()) / 60000; // minutes

    if (diff < 60) {
        return [Math.ceil(diff) + "m ago", diff <= params.recent];
    }

    diff = diff / 60;
    if (diff < 24) {
        return [Math.ceil(diff) + "h ago", false];
    }
    
    return [Math.ceil(diff / 24) + "d ago", false];
}

/**
 * Загружает ответы на указанный комментарий.
 * 
 * @param {string} commentId Идентификатор комментария
 * @param {object} commentObj Объект родительского комментария
 */
function loadReplies(commentId, commentObj) {

    gapi.client.youtube.comments.list({
        "part": "snippet",
        "parentId": commentId,
        "maxResults": params.limit || 10,
    }).then(
        (resp) => {
            if (resp.result.items.length < 1) {
                showWarning("Replies not found");
                return;
            }

            // id for collapsing
            var $list = $("<div id='r-" + commentId + "' class='collapse show'>");
            resp.result.items.forEach((item) => {
                var $c = makeComment(false, item.snippet, 0);
                $list.append($c.addClass("ml-3"));
            });
            commentObj.append($list);
        },
        (err) => {
            showError("Failed to load replies", err);
        }
    )
}

/**
 * Показывает предупреждение.
 * @param {string} msg Текст
 */
function showWarning(msg) {
    var $elem = $("#alert-template div").clone().addClass("alert-warning");
    $elem.prepend(msg);
    $("#alert-list").append($elem);
    showRequestForm();
}

/**
 * Показывает сообщение об ошибке на основе шаблона алерта.
 * @param {string} msg Сообщение об ошибке
 * @param {object} err Ошибка gapi
 */
function showError(msg, err) {
    if (err !== undefined) {
        console.error(err);
        if (err.result !== undefined) {
            err = err.result;
        }
        if (err.error !== undefined) {
            err = err.error;
            if (err.errors !== undefined && err.errors.length > 0) {
                err = err.errors[0];
                msg += ":<br>" + err.reason + ": " + err.message;
            } else {
                msg += ":<br>" + err.message;
            }
        }
    }

    var $elem = $("#alert-template div").clone().addClass("alert-danger");
    $elem.prepend(msg);
    $("#alert-list").append($elem);
    showRequestForm();
}
