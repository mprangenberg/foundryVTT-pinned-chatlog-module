const s_MODULE_NAME = 'pinned-chat-message';
const s_EVENT_NAME = `module.${s_MODULE_NAME}`;
const DEFAULT_TAB_NAME = 'default';
const PINNED_TAB_NAME = 'pinned';

let currentTab = DEFAULT_TAB_NAME;
let buttonDefault;
let buttonPinned;
let isChatTab = false;

/***********************************
 * HOOKS LISTENER
********************************/

Hooks.once('setup', function () {
    console.log(`${s_MODULE_NAME} | setup to ${s_MODULE_NAME}`); 

    game.settings.register(s_MODULE_NAME, 'minimalRoleToPinnedOther', {
        name: game.i18n.localize('PCM.settings.minimalRole.name'),
        hint: game.i18n.localize('PCM.settings.minimalRole.hint'),
        default: CONST.USER_ROLES.GAMEMASTER,
        choices: Object.entries(CONST.USER_ROLES).reduce(
            //Generate object of role with id for value
            (accumulator, [label, id]) => {
                const capLabel = label[0].toUpperCase() + label.slice(1).toLowerCase()
                const localizeLabel = game.i18n.localize(`USER.Role${capLabel}`)
                accumulator[id] = localizeLabel; 
                return accumulator
            },
            {}
        ),
        type: String,
        scope: 'world',
        config: true,
        requiresReload: true,
    });

    listenSocket()
})

Hooks.once('ready', function () {
    console.log(`${s_MODULE_NAME} | ready to ${s_MODULE_NAME}`); 

    buttonDefault.addClass('active')

    game.modules.get(s_MODULE_NAME).api = {
        pinnedMessage : (inputMessage) => {
            let message
            if(typeof inputMessage === 'string'){
                message = ChatMessage.get(inputMessage)
            } else if (inputMessage instanceof ChatMessage){
                message = inputMessage
            }

            if(message){
                pinnedMessage(message, true)
            }
        },
        unpinnedMessage : (inputMessage) => {
            let message
            if(typeof inputMessage === 'string'){
                message = ChatMessage.get(inputMessage)
            } else if (inputMessage instanceof ChatMessage){
                message = inputMessage
            }

            if(message){
                pinnedMessage(message, false)
            }
        },

        togglePinnedMessage : (inputMessage) => {
            let message
            if(typeof inputMessage === 'string'){
                message = ChatMessage.get(inputMessage)
            } else if (inputMessage instanceof ChatMessage){
                message = inputMessage
            }

            if(message){
                pinnedMessage(message)
            }
        }
      };
})

//Add chatlog type navigation
Hooks.on("renderChatLog", async function (chatLog, html, user) {
    //Add chat subtabs
    buttonDefault = $(`<a class="item default" data-tab="default">${game.i18n.localize("PCM.TABS.Default")}</a>`);
    buttonDefault.on('click', (event) => selectDefaultTab(chatLog));

    buttonPinned = $(`<a class="item pinned" data-tab="pinned">${game.i18n.localize("PCM.TABS.Pinned")}</a>`);
    buttonPinned.on('click', (event) => selectPinnedTab(chatLog));

    let toPrepend = $('<nav class="pinnedchatlog tabs"></nav>');
    toPrepend.append(buttonDefault).append(buttonPinned);
    
    html.prepend(toPrepend);

    //Check the activation of chat tab
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            const currentClassState = mutation.target.classList.contains('active')
            if(!currentClassState){
                isChatTab = false
            } else if(!isChatTab && currentClassState){
                //If we active the chat Tab we add the activation class on sub class
                isChatTab = true
                if(currentTab === DEFAULT_TAB_NAME){
                    buttonDefault.addClass('active');
                } else if (currentTab === PINNED_TAB_NAME){
                    buttonPinned.addClass('active');
                }
            }
        });
    });

    observer.observe(html[0], {
        attributes: true,
        attributeFilter: ['class']
      });
});

Hooks.on("renderChatMessage", (chatMessage, html, data) => {
    if(chatMessage.canUserModify(Users.instance.current,'update') 
    || game.user.role >= game.settings.get(s_MODULE_NAME, "minimalRoleToPinnedOther")){
        addButton(html, chatMessage);
    }

    if(chatMessage?.flags?.pinnedChat?.pinned){
        const htmlMessage = $("#chat-log").find(`.pinned-tab-message[data-message-id="${chatMessage.id}"]`)
        if(htmlMessage.length){
            //Already generate message in pinned tab
            htmlMessage.remove()
        }

        html.addClass("pinned-message")
    }

    if (currentTab === PINNED_TAB_NAME && !html.hasClass("pinned-message")) {
        html.hide();
    }
});


/***********************************
 * SOKET SETTING
********************************/
function pinnedUnownedMessage(messageId, isPinned){
    game.socket.emit(s_EVENT_NAME, {
      type: 'pinnedUnownedMessage',
      payload: {messageId, isPinned}
   });
  }
  
  /**
  * Provides the main incoming message registration and distribution of socket messages on the receiving side.
  */
  function listenSocket()
  {
     game.socket.on(s_EVENT_NAME, (data) =>
     {
        if (typeof data !== 'object') { return; }
  
        //Only GM must update the chatMessage
        if(!game.user.isGM){ return; }
  
        try
        {
           if (data.type === 'pinnedUnownedMessage' && data?.payload?.messageId) {
            const chatMessage = ChatMessage.get(data.payload.messageId)

            pinnedMessageUpdate(chatMessage, data?.payload?.isPinned)
           }
        }
        catch (err)
        {
           console.error(err);
        }
     });
  }

/***********************************
 * PRIVATE METHOD
********************************/
function setClassVisibility(cssClass, visible) {
    if (visible) {
        cssClass.removeClass("hardHide");
        cssClass.show();
    } else
        cssClass.hide();
};

function selectDefaultTab(chatLog){
    currentTab = DEFAULT_TAB_NAME;
    buttonDefault.addClass('active');
    buttonPinned.removeClass('active');

    setClassVisibility($(".chat-message"), true);

    $(".pinned-tab-message").remove();

    chatLog.scrollBottom(true)
};

async function selectPinnedTab(chatLog){
    currentTab = PINNED_TAB_NAME;
    buttonPinned.addClass('active');
    buttonDefault.removeClass('active');

    setClassVisibility($(".chat-message"), false);
    setClassVisibility($(".pinned-message"), true);

    let pinnedMessages = game.messages.contents.filter(entry => entry.flags?.pinnedChat?.pinned);

    const log = $("#chat-log");
    let htmlMessages = [];
    
    for ( let i=0; i<pinnedMessages.length; i++) {
        let pinnedMessage = pinnedMessages[i];
        if (!pinnedMessage.visible) continue;//isWisper or other hide message

        const htmlMessage = log.find(`.message[data-message-id="${pinnedMessage.id}"]`)
        if(htmlMessage.length) continue;//is already render

        pinnedMessage.logged = true;
        try {
            let messageHtml = await pinnedMessage.getHTML();
            messageHtml.addClass('pinned-tab-message')
            htmlMessages.push(messageHtml);
        } catch (err) {
          err.message = `Pinned message ${pinnedMessage.id} failed to render: ${err})`;
          console.error(err);
        }
      }

      // Prepend the HTML
      log.prepend(htmlMessages);
    
    chatLog.scrollBottom(true)
};

function addButton(messageElement, chatMessage) {
    let messageMetadata = messageElement.find(".message-metadata")
    // Can't find it?
    if (messageMetadata.length != 1) {
        return;
    }
    let button = $(`<a id='btn-pinned-message-${chatMessage.id}'> <i class="fas"></i></a>`);//Example of circle fa-circle
    button.on('click', (event) => btnPinnedMessageClick(chatMessage));
    changeIcon(button, chatMessage.flags?.pinnedChat?.pinned);
    messageMetadata.append(button);
};

function btnPinnedMessageClick(chatMessage){
    pinnedMessage(chatMessage)
}

function pinnedMessage(chatMessage, isPinned){
    if(chatMessage.canUserModify(Users.instance.current,'update')){
        pinnedMessageUpdate(chatMessage, isPinned)
    } else if(game.user.role >= game.settings.get(s_MODULE_NAME, "minimalRoleToPinnedOther")){
        pinnedUnownedMessage(chatMessage.id, isPinned)
    } else {
        ui.notifications.error(game.i18n.localize('PCM.error.cantPinned'))
    }
};

function pinnedMessageUpdate(chatMessage, isPinned){
    if(isPinned === undefined){
        //toggle pinned flag
        isPinned = ! chatMessage.flags?.pinnedChat?.pinned
    }

    chatMessage.update({ "flags.pinnedChat.pinned": isPinned },{"diff" :true});
};

function changeIcon(button, isPinned){
    let icon = button.find(".fas");

    if(isPinned){
        icon.removeClass('fa-map-pin');
        icon.addClass('fa-circle');
    } else {
        icon.addClass('fa-map-pin');
        icon.removeClass('fa-circle');
    }
};

